import { useMemo, useState } from 'react';
import workbook from '../calculator/workbook.json';
import { calculateWorkbook, getWorkbookCellValue } from '../calculator/excelEngine';
import { CALCULATORS, CALCULATOR_GROUPS } from '../calculator/definitions';

const calculatorById = new Map(CALCULATORS.map((calculator) => [calculator.id, calculator]));

function displayNumber(value, maxFractionDigits = 4) {
  if (typeof value !== 'number') return String(value ?? '—');
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fa-IR', { maximumFractionDigits: maxFractionDigits }).format(value);
}

function sourceValue(address) {
  const cell = workbook.cells[address.toUpperCase()];
  return cell?.formula ? cell.cached : (cell?.value ?? '');
}

function sourceText(address) {
  const cell = workbook.cells[address.toUpperCase()];
  return cell?.value ?? '';
}

function sourceUnit(address) {
  const format = workbook.cells[address.toUpperCase()]?.numberFormat ?? '';
  const match = format.match(/"([^"]+)"/);
  return match?.[1] ?? '';
}

function Metric({ label, value, unit, featured }) {
  const isMessage = typeof value === 'string' && (value.length > 18 || value.startsWith('#'));
  return (
    <div className={`calc-metric ${featured ? 'is-featured' : ''} ${isMessage ? 'is-message' : ''}`}>
      <div className="calc-metric-label">{label}</div>
      <div className="calc-metric-value" dir="auto">
        <span>{displayNumber(value)}</span>
        {unit && typeof value === 'number' && <small>{unit}</small>}
      </div>
    </div>
  );
}

function InputField({ field, value, onChange }) {
  const id = `camac-calc-${field.cell}`;
  const current = value == null ? '' : String(value);
  return (
    <label className="calc-field" htmlFor={id}>
      <span className="calc-field-label">{field.label}</span>
      <span className="calc-field-control">
        {field.type === 'select' ? (
          <select
            id={id}
            value={current}
            onChange={(event) => {
              const raw = event.target.value;
              const option = field.options.find((item) => String(item) === raw);
              onChange(field.cell, option ?? raw);
            }}
          >
            <option value="" disabled>انتخاب کنید</option>
            {field.options.map((option) => (
              <option key={String(option)} value={String(option)}>{option}</option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type="number"
            inputMode="decimal"
            step={field.step ?? 'any'}
            value={current}
            onChange={(event) => {
              const raw = event.currentTarget.value;
              onChange(field.cell, raw === '' ? '' : Number(raw));
            }}
          />
        )}
        {field.unit && <span className="calc-field-unit">{field.unit}</span>}
      </span>
    </label>
  );
}

function MetricGrid({ metrics, values, overrides }) {
  return (
    <div className="calc-metrics">
      {metrics.map((metric) => {
        const value = getWorkbookCellValue(workbook, metric.cell, values, overrides);
        const label = metric.labelCell ? sourceText(metric.labelCell) : metric.label;
        return <Metric key={metric.cell} label={label} value={value} unit={metric.unit} featured={metric.featured} />;
      })}
    </div>
  );
}

function DoorMatrix({ presentation, values }) {
  const widths = presentation.columns.map((column) => sourceValue(`${column}${presentation.rows[0].widthRow}`));
  return (
    <div className="calc-table-wrap">
      <table className="calc-table calc-fit-table">
        <thead>
          <tr>
            <th scope="col">نوع درب / عرض</th>
            {widths.map((width, index) => <th key={`${width}-${index}`} scope="col">{displayNumber(width)}</th>)}
          </tr>
        </thead>
        <tbody>
          {presentation.rows.map((row) => (
            <tr key={row.resultRow}>
              <th scope="row">{sourceText(row.titleCell)}</th>
              {presentation.columns.map((column) => {
                const value = values[`${column}${row.resultRow}`];
                const fits = value === 'قابل اجرا';
                return (
                  <td key={`${column}${row.resultRow}`} className={fits ? 'is-fit' : 'is-no-fit'}>
                    <span className="calc-status">{value ?? '—'}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="calc-table-foot"><span className="calc-live-dot" /> هر خانه با فرمول‌های مهندسی کاماک و بر اساس ورودی شما به‌روزرسانی می‌شود.</div>
    </div>
  );
}

function IronSchedule({ presentation, values, overrides }) {
  const height = getWorkbookCellValue(workbook, 'W18', values, overrides);
  const collars = getWorkbookCellValue(workbook, 'AD21', values, overrides);
  const branchNote = getWorkbookCellValue(workbook, 'W21', values, overrides);
  return (
    <>
      <div className="calc-metrics calc-metrics-compact">
        <Metric label="ارتفاع کل چاه" value={height} unit="m" featured />
        <Metric label={sourceText('AF21')} value={collars} unit="کلاف" />
        <Metric label="یادداشت شاخه‌بندی" value={branchNote} />
      </div>
      <div className="calc-result-block">
        <div className="calc-result-heading"><span>01</span><h4>مقادیر مصالح و اجرا</h4></div>
        <div className="calc-table-wrap">
          <table className="calc-table">
            <thead><tr><th>بابت</th><th>اندازه / مشخصات</th><th>تعداد</th></tr></thead>
            <tbody>
              {presentation.materialRows.map((row) => {
                const quantity = values[`AC${row}`];
                return (
                  <tr key={row}>
                    <th scope="row">{sourceText(`W${row}`)}</th>
                    <td>{displayNumber(getWorkbookCellValue(workbook, `Z${row}`, values, overrides))}</td>
                    <td className="calc-quantity">{displayNumber(quantity)} <small>{sourceUnit(`AC${row}`)}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="calc-result-block">
        <div className="calc-result-heading"><span>02</span><h4>برآورد قیمت بر اساس وزن محاسبه‌شده</h4></div>
        <div className="calc-table-wrap">
          <table className="calc-table calc-cost-table">
            <thead><tr><th>اندازهٔ نبشی</th><th>وزن برآوردی</th><th>قیمت کل</th></tr></thead>
            <tbody>
              {presentation.priceRows.map((row) => (
                <tr key={row}>
                  <th scope="row">{displayNumber(sourceValue(`AC${row}`))}</th>
                  <td>{displayNumber(values[`AA${row}`])} <small>kg</small></td>
                  <td className="calc-price">{displayNumber(values[`W${row}`])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="calc-differences">
          {presentation.priceDiffs.map((item) => (
            <div key={item.cell} className="calc-difference">
              <span>{sourceText(item.labelCell)}</span>
              <strong>{displayNumber(values[item.cell])}</strong>
            </div>
          ))}
        </div>
        <p className="calc-inline-note">قیمت بر پایهٔ وزن محاسبه‌شده و نرخ هر کیلوِ واردشده نمایش داده می‌شود.</p>
      </div>
    </>
  );
}

function SlabMaterials({ presentation, values }) {
  return (
    <>
      <div className="calc-metrics calc-metrics-compact">
        {presentation.metrics.map((metric) => <Metric key={metric.cell} label={metric.label} value={values[metric.cell]} unit={metric.unit} />)}
      </div>
      <div className="calc-result-block">
        <div className="calc-result-heading"><span>01</span><h4>صورت اجناس دال</h4></div>
        <div className="calc-table-wrap">
          <table className="calc-table">
            <thead><tr><th>جنس</th><th>اندازه / واحد</th><th>تعداد</th></tr></thead>
            <tbody>
              {presentation.materialRows.map((row) => {
                const item = sourceText(`AL${row}`);
                const hasUnitValue = Boolean(workbook.cells[`AI${row}`]);
                const unitValue = hasUnitValue ? getWorkbookCellValue(workbook, `AI${row}`, values) : null;
                const quantity = values[`AK${row}`];
                return (
                  <tr key={row}>
                    <th scope="row">{item}</th>
                    <td>{hasUnitValue ? <>{displayNumber(unitValue)} <small>{sourceUnit(`AI${row}`)}</small></> : '—'}</td>
                    <td className="calc-quantity">{displayNumber(quantity)} <small>{sourceUnit(`AK${row}`)}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function DoorSteel({ presentation, values }) {
  return (
    <div className="calc-result-block">
      <div className="calc-result-heading"><span>01</span><h4>صورت آهن نصب درب</h4></div>
      <div className="calc-table-wrap">
        <table className="calc-table">
          <thead><tr><th>مورد</th><th>نوع آهن</th><th>طول</th><th>تعداد</th></tr></thead>
          <tbody>
            {presentation.materialRows.map((row) => (
              <tr key={row}>
                <th scope="row">{sourceText(`AT${row}`)}</th>
                <td>{displayNumber(values[`AQ${row}`])}</td>
                <td>{displayNumber(values[`AO${row}`])} <small>{sourceUnit(`AO${row}`)}</small></td>
                <td className="calc-quantity">{displayNumber(values[`AS${row}`])} <small>{sourceUnit(`AS${row}`)}</small></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function renderResults(calculator, values, overrides) {
  const presentation = calculator.presentation;
  if (presentation.type === 'door-matrix') return <DoorMatrix presentation={presentation} values={values} />;
  if (presentation.type === 'iron-schedule') return <IronSchedule presentation={presentation} values={values} overrides={overrides} />;
  if (presentation.type === 'slab-materials') return <SlabMaterials presentation={presentation} values={values} />;
  if (presentation.type === 'door-steel') return <DoorSteel presentation={presentation} values={values} />;
  if (presentation.type === 'travel-time') {
    return (
      <>
        <div className="calc-speed-list">
          {presentation.metrics.map((metric, index) => (
            <div className={`calc-speed-card ${metric.featured ? 'is-featured' : ''}`} key={metric.cell}>
              <span className="calc-speed-index">0{index + 1}</span>
              <div className="calc-speed-copy">
                <span>{sourceText(metric.labelCell)}</span>
                <strong>{metric.formulaSpeed}</strong>
              </div>
              <b>{displayNumber(values[metric.cell])}<small>{metric.unit}</small></b>
            </div>
          ))}
        </div>
        <div className="calc-source-alert" role="note">
          در ردیف سرعت آخر، عنوان «2 m/s» است؛ سرعتِ به‌کاررفته در محاسبه برای دقت نتیجه 2.5 m/s است.
        </div>
      </>
    );
  }
  return <MetricGrid metrics={presentation.metrics} values={values} overrides={overrides} />;
}

function notesFor(calculator, values, overrides) {
  if (calculator.id === 'door-min') {
    const result = getWorkbookCellValue(workbook, 'J7', values, overrides);
    if (typeof result === 'number' && result > 400) {
      return 'این ترکیب ورودی به نتیجه‌ای نامتعارف می‌رسد؛ پیش از استفادهٔ اجرایی، مقدار را با واحد فنی کاماک بررسی کنید.';
    }
  }
  if (['shaft-capacity', 'cabin-capacity', 'shaft-from-cabin', 'hydraulic'].includes(calculator.id)) {
    const refs = calculator.id === 'shaft-capacity' ? ['N13']
      : calculator.id === 'cabin-capacity' ? ['N32']
        : calculator.id === 'shaft-from-cabin' ? ['N51'] : ['N70'];
    if (refs.some((cell) => String(values[cell]).includes('برسی جدول'))) {
      return 'این ترکیب ورودی خارج از بازه‌های قابل‌محاسبه است؛ ابعاد یا آرایش انتخاب‌شده را بازبینی کنید.';
    }
  }
  return '';
}

export default function CalculatorSection() {
  const [activeId, setActiveId] = useState(CALCULATORS[0].id);
  const [overrides, setOverrides] = useState({});
  const calculator = calculatorById.get(activeId) ?? CALCULATORS[0];
  const activeGroup = CALCULATOR_GROUPS.find((group) => group.id === calculator.group);
  const hasCompleteInputs = calculator.fields.every(({ cell }) => (
    Object.prototype.hasOwnProperty.call(overrides, cell)
    && overrides[cell] !== ''
    && overrides[cell] !== null
    && overrides[cell] !== undefined
  ));
  const calculation = useMemo(() => {
    if (!hasCompleteInputs) return { values: {}, error: '' };
    try {
      return { values: calculateWorkbook(workbook, overrides), error: '' };
    } catch (error) {
      return { values: {}, error: error instanceof Error ? error.message : String(error) };
    }
  }, [calculator, hasCompleteInputs, overrides]);
  const values = calculation.values;
  const calculationError = calculation.error;

  const changeValue = (cell, value) => setOverrides((current) => ({ ...current, [cell]: value }));
  const resetCurrent = () => setOverrides((current) => {
    const next = { ...current };
    calculator.fields.forEach(({ cell }) => delete next[cell]);
    return next;
  });
  const displayedNotes = hasCompleteInputs ? notesFor(calculator, values, overrides) : '';

  return (
    <section id="calculator" className="camac-calculator interactive" dir="rtl" aria-labelledby="calc-title">
      <div className="calc-container">
        <div className="calc-eyebrow"><span className="calc-eyebrow-mark" /> ابزار مهندسی کاماک <span className="calc-eyebrow-line" /></div>
        <div className="calc-header">
          <div>
            <h2 id="calc-title">محاسبه‌گر آسانسور</h2>
            <p>ده ابزار محاسباتی، بر پایه مهندسی کاماک.</p>
          </div>
          <div className="calc-source-badge"><span>مهندسی کاماک</span><strong>محاسبات دقیق</strong><small>فرمول‌های تخصصی آسانسور</small></div>
        </div>

        <div className="calc-group-tabs" role="tablist" aria-label="گروه محاسبات">
          {CALCULATOR_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={group.id === calculator.group}
              className={group.id === calculator.group ? 'is-active' : ''}
              onClick={() => setActiveId(group.calculators[0])}
            >
              <span>{group.number}</span>{group.label}
            </button>
          ))}
        </div>

        <div className="calc-tool-tabs" role="tablist" aria-label={`ابزارهای گروه ${activeGroup?.label}`}>
          {activeGroup?.calculators.map((id) => {
            const item = calculatorById.get(id);
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={id === activeId}
                className={id === activeId ? 'is-active' : ''}
                onClick={() => setActiveId(id)}
              >{item.title}</button>
            );
          })}
        </div>

        <div className="calc-panel" role="tabpanel">
          <div className="calc-panel-heading">
            <div><span className="calc-panel-kicker">محاسبهٔ زنده · {activeGroup?.number}</span><h3>{calculator.title}</h3></div>
            <p>{calculator.description}</p>
          </div>

          <div className="calc-workspace">
            <div className="calc-input-panel">
              <div className="calc-subhead"><span className="calc-subhead-dot" /><h4>ورودی‌ها</h4><span className="calc-subhead-cell">واحدهای مهندسی متناسب با هر ورودی</span></div>
              <div className="calc-fields">
                {calculator.fields.map((field) => (
                  <InputField
                    key={field.cell}
                    field={field}
                    value={overrides[field.cell] ?? ''}
                    onChange={changeValue}
                  />
                ))}
              </div>
              <button className="calc-reset" type="button" onClick={resetCurrent}>پاک‌کردن ورودی‌های این محاسبه <span aria-hidden="true">↺</span></button>
            </div>

            <div className="calc-output-panel">
              <div className="calc-subhead"><span className="calc-subhead-dot is-output" /><h4>نتیجه</h4><span className="calc-subhead-live">به‌روزرسانی خودکار</span></div>
              {!hasCompleteInputs ? (
                <div className="calc-empty-state" role="status">
                  <span aria-hidden="true">—</span>
                  <p>برای نمایش نتیجه، همهٔ ورودی‌های لازم را تکمیل کنید.</p>
                </div>
              ) : calculationError ? (
                <div className="calc-source-alert" role="alert">خطا در محاسبه: {calculationError}</div>
              ) : renderResults(calculator, values, overrides)}
              {displayedNotes && <div className="calc-source-alert" role="note">{displayedNotes}</div>}
            </div>
          </div>

          <div className="calc-footnote">
            <span className="calc-footnote-icon">i</span>
            <p>نتیجه‌ها با فرمول‌های مهندسی کاماک و منطق گردکردن دقیق محاسبه می‌شوند. برای استفادهٔ اجرایی، ابعاد و ضوابط پروژه را با نقشه‌ها و مهندس مسئول تطبیق دهید.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
