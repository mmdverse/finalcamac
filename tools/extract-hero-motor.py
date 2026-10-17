#!/usr/bin/env python3
"""Extract one named mesh node from a self-contained glTF 2.0 binary (GLB).

Only geometry, its materials, and the node's fully-composed scene transform are kept.
No external Python packages are required.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import struct
from pathlib import Path
from typing import Any


def read_glb(path: Path) -> tuple[dict[str, Any], bytes]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise ValueError(f"{path} is not a GLB file")
    version, total_length = struct.unpack_from("<II", data, 4)
    if version != 2 or total_length != len(data):
        raise ValueError(f"{path} must be a complete GLB 2.0 file")

    offset = 12
    document = None
    binary = None
    while offset < total_length:
        chunk_length, chunk_type = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunk = data[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == b"JSON":
            document = json.loads(chunk.rstrip(b" \t\r\n\0").decode("utf-8"))
        elif chunk_type == b"BIN\0":
            binary = chunk
    if document is None or binary is None:
        raise ValueError(f"{path} must contain JSON and BIN chunks")
    if len(document.get("buffers", [])) != 1 or document["buffers"][0].get("uri"):
        raise ValueError("Only a self-contained GLB with one embedded buffer is supported")
    return document, binary[: document["buffers"][0]["byteLength"]]


def multiply(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [
        [sum(a[row][k] * b[k][column] for k in range(4)) for column in range(4)]
        for row in range(4)
    ]


def local_matrix(node: dict[str, Any]) -> list[list[float]]:
    if "matrix" in node:
        values = node["matrix"]
        return [[float(values[column * 4 + row]) for column in range(4)] for row in range(4)]

    tx, ty, tz = node.get("translation", [0.0, 0.0, 0.0])
    x, y, z, w = node.get("rotation", [0.0, 0.0, 0.0, 1.0])
    sx, sy, sz = node.get("scale", [1.0, 1.0, 1.0])
    rotation = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [rotation[0][0] * sx, rotation[0][1] * sy, rotation[0][2] * sz, tx],
        [rotation[1][0] * sx, rotation[1][1] * sy, rotation[1][2] * sz, ty],
        [rotation[2][0] * sx, rotation[2][1] * sy, rotation[2][2] * sz, tz],
        [0.0, 0.0, 0.0, 1.0],
    ]


def align4(size: int) -> int:
    return (size + 3) & ~3


def extract_node(source: Path, destination: Path, node_name: str) -> None:
    source_doc, source_binary = read_glb(source)
    nodes = source_doc.get("nodes", [])
    matches = [index for index, node in enumerate(nodes) if node.get("name") == node_name]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one node named {node_name!r}; found {len(matches)}")
    node_index = matches[0]
    source_node = nodes[node_index]
    if "mesh" not in source_node:
        raise ValueError(f"Node {node_name!r} has no mesh")

    mesh_index = source_node["mesh"]
    source_mesh = source_doc["meshes"][mesh_index]
    if not source_mesh.get("primitives"):
        raise ValueError(f"Mesh for {node_name!r} has no primitives")
    if any(primitive.get("targets") for primitive in source_mesh["primitives"]):
        raise ValueError("Morph targets are not expected for this motor mesh")

    # Resolve the node's original transform through all parents before removing siblings.
    parents: list[int | None] = [None] * len(nodes)
    for parent_index, node in enumerate(nodes):
        for child_index in node.get("children", []):
            if parents[child_index] is not None:
                raise ValueError(f"Node {child_index} has more than one parent")
            parents[child_index] = parent_index

    world_cache: dict[int, list[list[float]]] = {}

    def world_matrix(index: int) -> list[list[float]]:
        if index not in world_cache:
            parent = parents[index]
            local = local_matrix(nodes[index])
            world_cache[index] = local if parent is None else multiply(world_matrix(parent), local)
        return world_cache[index]

    world = world_matrix(node_index)
    if any(not math.isfinite(value) for row in world for value in row):
        raise ValueError("Motor node has a non-finite world transform")
    world_column_major = [world[row][column] for column in range(4) for row in range(4)]

    # Collect and compact just the accessors and bufferViews referenced by this mesh.
    accessor_indices: list[int] = []
    for primitive in source_mesh["primitives"]:
        accessor_indices.extend(primitive.get("attributes", {}).values())
        if "indices" in primitive:
            accessor_indices.append(primitive["indices"])
        for target in primitive.get("targets", []):
            accessor_indices.extend(target.values())
    accessor_indices = list(dict.fromkeys(accessor_indices))

    buffer_view_indices: list[int] = []
    for accessor_index in accessor_indices:
        accessor = source_doc["accessors"][accessor_index]
        if "sparse" in accessor:
            raise ValueError("Sparse accessors are not expected for this motor mesh")
        if "bufferView" in accessor:
            buffer_view_indices.append(accessor["bufferView"])
    buffer_view_indices = list(dict.fromkeys(buffer_view_indices))

    packed_binary = bytearray()
    buffer_view_map: dict[int, int] = {}
    output_buffer_views: list[dict[str, Any]] = []
    for old_index in buffer_view_indices:
        source_view = source_doc["bufferViews"][old_index]
        if source_view.get("buffer", 0) != 0:
            raise ValueError("The motor references a non-embedded buffer")
        old_offset = source_view.get("byteOffset", 0)
        byte_length = source_view["byteLength"]
        payload = source_binary[old_offset : old_offset + byte_length]
        if len(payload) != byte_length:
            raise ValueError(f"Buffer view {old_index} falls outside the source BIN chunk")
        new_offset = align4(len(packed_binary))
        packed_binary.extend(b"\0" * (new_offset - len(packed_binary)))
        packed_binary.extend(payload)
        new_view = {
            key: copy.deepcopy(value)
            for key, value in source_view.items()
            if key not in {"buffer", "byteOffset"}
        }
        new_view["buffer"] = 0
        new_view["byteOffset"] = new_offset
        buffer_view_map[old_index] = len(output_buffer_views)
        output_buffer_views.append(new_view)

    accessor_map: dict[int, int] = {}
    output_accessors: list[dict[str, Any]] = []
    for old_index in accessor_indices:
        accessor = copy.deepcopy(source_doc["accessors"][old_index])
        if "bufferView" in accessor:
            accessor["bufferView"] = buffer_view_map[accessor["bufferView"]]
        accessor_map[old_index] = len(output_accessors)
        output_accessors.append(accessor)

    used_materials = list(
        dict.fromkeys(
            primitive["material"]
            for primitive in source_mesh["primitives"]
            if "material" in primitive
        )
    )
    material_map: dict[int, int] = {}
    output_materials: list[dict[str, Any]] = []
    for old_index in used_materials:
        material = copy.deepcopy(source_doc["materials"][old_index])
        material_map[old_index] = len(output_materials)
        output_materials.append(material)

    # This particular motor uses solid-color materials. If future source revisions add a
    # texture dependency, stop rather than quietly dropping it from the production asset.
    def has_texture_reference(value: Any) -> bool:
        if isinstance(value, dict):
            return any(
                "Texture" in key or has_texture_reference(nested)
                for key, nested in value.items()
            )
        if isinstance(value, list):
            return any(has_texture_reference(nested) for nested in value)
        return False

    if has_texture_reference(output_materials):
        raise ValueError("Motor materials unexpectedly reference textures; update the extractor")

    output_primitives = []
    triangle_count = 0
    for primitive in source_mesh["primitives"]:
        copied = copy.deepcopy(primitive)
        copied["attributes"] = {
            semantic: accessor_map[old_accessor]
            for semantic, old_accessor in primitive.get("attributes", {}).items()
        }
        if "indices" in copied:
            old_indices = primitive["indices"]
            copied["indices"] = accessor_map[old_indices]
            if primitive.get("mode", 4) == 4:
                triangle_count += source_doc["accessors"][old_indices]["count"] // 3
        if "material" in copied:
            copied["material"] = material_map[copied["material"]]
        if "targets" in primitive:
            copied["targets"] = [
                {semantic: accessor_map[index] for semantic, index in target.items()}
                for target in primitive["targets"]
            ]
        output_primitives.append(copied)

    output_mesh = {
        "name": source_mesh.get("name", node_name),
        "primitives": output_primitives,
    }
    for key in ("weights", "extras"):
        if key in source_mesh:
            output_mesh[key] = copy.deepcopy(source_mesh[key])

    output_node: dict[str, Any] = {
        "name": node_name,
        "mesh": 0,
        "matrix": world_column_major,
    }
    for key in ("extras",):
        if key in source_node:
            output_node[key] = copy.deepcopy(source_node[key])

    output_doc = {
        "asset": copy.deepcopy(source_doc["asset"]),
        "scene": 0,
        "scenes": [{"name": node_name, "nodes": [0]}],
        "nodes": [output_node],
        "meshes": [output_mesh],
        "materials": output_materials,
        "accessors": output_accessors,
        "bufferViews": output_buffer_views,
        "buffers": [{"byteLength": len(packed_binary)}],
    }

    # Keep only extensions actually used by the retained motor node, mesh, or materials.
    for key in ("extensionsUsed", "extensionsRequired"):
        if key in source_doc and source_doc[key]:
            raise ValueError(f"Unexpected source {key}: {source_doc[key]}")

    json_bytes = json.dumps(
        output_doc,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
    ).encode("utf-8")
    json_bytes += b" " * (align4(len(json_bytes)) - len(json_bytes))
    binary_bytes = bytes(packed_binary)
    binary_chunk = binary_bytes + b"\0" * (align4(len(binary_bytes)) - len(binary_bytes))
    total_length = 12 + 8 + len(json_bytes) + 8 + len(binary_chunk)
    output = bytearray(b"glTF")
    output.extend(struct.pack("<II", 2, total_length))
    output.extend(struct.pack("<I4s", len(json_bytes), b"JSON"))
    output.extend(json_bytes)
    output.extend(struct.pack("<I4s", len(binary_chunk), b"BIN\0"))
    output.extend(binary_chunk)

    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(output)
    print(
        f"Extracted {node_name}: 1 node, 1 mesh, {len(output_primitives)} primitives, "
        f"{triangle_count:,} triangles, {len(output_materials)} materials; "
        f"{len(output):,} bytes → {destination}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="source GLB file")
    parser.add_argument("destination", type=Path, help="destination GLB file")
    parser.add_argument("--node", default="BM300-2", help="exact glTF node name to retain")
    args = parser.parse_args()
    extract_node(args.source, args.destination, args.node)


if __name__ == "__main__":
    main()
