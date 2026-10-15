const doorTypes = ['تلسکوپی', 'سانترال'];
const leaves = [2, 3, 4];
const doorWidths = [70, 80, 90, 100, 110, 120, 130];
const cabinDoors = [1, 2];
const noseSizes = [3, 4, 5, 6];
const noseHint = 'اگر کابین‌ساز نیستید، ۶ را انتخاب کنید';
const leafHint = 'اگر شرکت آسانسور نیستید، ۴٫۵ را انتخاب کنید';
const floorToFloorOptions = Array.from({ length: 13 }, (_, index) => Number((3 + index / 10).toFixed(1)));
const layouts = ['پشت', 'بغل'];

export const CALCULATOR_GROUPS = [
  { id: 'doors', label: 'درب و چاه', number: '01', calculators: ['door-fit', 'door-min'] },
  { id: 'capacity', label: 'ظرفیت و ابعاد', number: '02', calculators: ['shaft-capacity', 'cabin-capacity', 'shaft-from-cabin', 'hydraulic'] },
  { id: 'materials', label: 'مصالح و آهن', number: '03', calculators: ['iron', 'slab', 'door-steel'] },
  { id: 'travel', label: 'زمان سفر', number: '04', calculators: ['travel-time'] },
];

export const CALCULATORS = [
  {
    id: 'door-fit', group: 'doors', title: 'انتخاب درب بر اساس عرض چاه',
    description: 'عرض چاه را وارد کن تا چهار جدول اجرایی کاماک برای عرض‌های مختلف درب محاسبه شود.',
    fields: [{ cell: 'B5', label: 'عرض چاه آسانسور', unit: 'cm', type: 'number' }],
    presentation: {
      type: 'door-matrix',
      rows: [
        { titleCell: 'B7', widthRow: 8, resultRow: 9 },
        { titleCell: 'B11', widthRow: 12, resultRow: 13 },
        { titleCell: 'B15', widthRow: 16, resultRow: 17 },
        { titleCell: 'B19', widthRow: 20, resultRow: 21 },
      ],
      columns: ['B', 'C', 'D', 'E', 'F', 'G', 'H'],
    },
  },
  {
    id: 'door-min', group: 'doors', title: 'حداقل عرض چاه برای درب',
    description: 'حداقل عرض موردنیاز را با توجه به عرض درب، تعداد لته و نوع بازشو با فرمول‌های مهندسی کاماک محاسبه می‌کند.',
    fields: [
      { cell: 'J5', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'K5', label: 'تعداد لته', unit: 'لته', type: 'select', options: leaves },
      { cell: 'L5', label: 'نوع درب', type: 'select', options: doorTypes },
    ],
    presentation: { type: 'metrics', metrics: [{ cell: 'J7', label: 'حداقل عرض موردنیاز چاه', unit: 'cm', featured: true }] },
  },
  {
    id: 'shaft-capacity', group: 'capacity', title: 'ظرفیت بر اساس ابعاد چاه',
    description: 'ابعاد چاه و آرایش درب/وزنه را وارد کن؛ ابعاد کابین، مساحت و ظرفیت بر پایهٔ زنجیرهٔ محاسبات مهندسی کاماک به دست می‌آیند.',
    fields: [
      { cell: 'N5', label: 'عرض چاه', unit: 'cm', type: 'number' },
      { cell: 'O5', label: 'طول چاه', unit: 'cm', type: 'number' },
      { cell: 'P5', label: 'نوع درب', type: 'select', options: doorTypes },
      { cell: 'Q5', label: 'تعداد درب کابین', unit: 'درب', type: 'select', options: cabinDoors },
      { cell: 'R5', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'S5', label: 'تعداد لته', unit: 'لته', type: 'select', options: leaves },
      { cell: 'T5', label: 'دماغهٔ کابین', hint: noseHint, unit: 'cm', type: 'select', options: noseSizes },
      { cell: 'U5', label: 'جانمایی وزنه', type: 'select', options: layouts },
    ],
    presentation: {
      type: 'metrics',
      metrics: [
        { cell: 'T7', label: 'طول کابین', unit: 'cm', featured: true },
        { cell: 'R7', label: 'عرض کابین', unit: 'cm', featured: true },
        { cell: 'N7', label: 'عرض کادر وزنه', unit: 'cm' },
        { cell: 'P7', label: 'مساحت محاسباتی کابین', unit: 'm²', featured: true },
        { cell: 'N10', label: 'ظرفیت محاسبه‌شده', unit: 'kg' },
        { cell: 'R10', label: 'تعداد نفر برآوردشده', unit: 'نفر' },
        { cell: 'N13', label: 'ظرفیت جایگزین طبق جدول مساحت', unit: 'kg' },
        { cell: 'R13', label: 'تعداد نفرِ ظرفیت جایگزین', unit: 'نفر' },
        { cell: 'R16', label: 'حداقل عرض چاه برای درب انتخابی', unit: 'cm' },
        { cell: 'N16', label: 'کنترل تطابق ورودی‌ها' },
      ],
    },
  },
  {
    id: 'cabin-capacity', group: 'capacity', title: 'ظرفیت بر اساس ابعاد کابین',
    description: 'مساحت کابینِ ورودی را با جدول ظرفیت مهندسی کاماک تطبیق می‌دهد و ظرفیت/تعداد نفر متناظر را نشان می‌دهد.',
    fields: [
      { cell: 'N24', label: 'عرض کابین', unit: 'cm', type: 'number' },
      { cell: 'O24', label: 'طول کابین', unit: 'cm', type: 'number' },
      { cell: 'P24', label: 'نوع درب', type: 'select', options: doorTypes },
      { cell: 'Q24', label: 'تعداد درب کابین', unit: 'درب', type: 'select', options: cabinDoors },
      { cell: 'R24', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'S24', label: 'تعداد لته', unit: 'لته', type: 'select', options: leaves },
      { cell: 'T24', label: 'دماغهٔ کابین', hint: noseHint, unit: 'cm', type: 'select', options: noseSizes },
      { cell: 'U24', label: 'اندازهٔ لته', hint: leafHint, unit: 'واحد محاسباتی', type: 'select', options: [4.5, 2.5] },
    ],
    presentation: {
      type: 'metrics',
      metrics: [
        { cell: 'N26', label: 'مساحت کابین', unit: 'm²', featured: true },
        { cell: 'N29', label: 'ظرفیت برآوردشده', unit: 'kg' },
        { cell: 'R29', label: 'تعداد نفر متناظر', unit: 'نفر' },
        { cell: 'N32', label: 'ظرفیت جایگزین طبق جدول مساحت', unit: 'kg' },
        { cell: 'R32', label: 'تعداد نفرِ ظرفیت جایگزین', unit: 'نفر' },
      ],
    },
  },
  {
    id: 'shaft-from-cabin', group: 'capacity', title: 'ابعاد چاه از روی کابین',
    description: 'با توجه به کابین، درب و جانمایی وزنه، ابعاد پیشنهادی چاه و کنترل‌های مهندسی کاماک را نمایش می‌دهد.',
    fields: [
      { cell: 'N40', label: 'عرض کابین', unit: 'cm', type: 'number' },
      { cell: 'O40', label: 'طول کابین', unit: 'cm', type: 'number' },
      { cell: 'P40', label: 'نوع درب', type: 'select', options: doorTypes },
      { cell: 'Q40', label: 'تعداد درب کابین', unit: 'درب', type: 'select', options: cabinDoors },
      { cell: 'R40', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'S40', label: 'تعداد لته', unit: 'لته', type: 'select', options: leaves },
      { cell: 'T40', label: 'دماغهٔ کابین', hint: noseHint, unit: 'cm', type: 'select', options: noseSizes },
      { cell: 'U40', label: 'جانمایی وزنه', type: 'select', options: layouts },
    ],
    presentation: {
      type: 'metrics',
      metrics: [
        { cell: 'N42', label: 'عرض چاه محاسبه‌شده', unit: 'cm', featured: true },
        { cell: 'R42', label: 'طول چاه محاسبه‌شده', unit: 'cm', featured: true },
        { cell: 'N45', label: 'مساحت کابین', unit: 'm²' },
        { cell: 'R45', label: 'کادر وزنه', unit: 'cm' },
        { cell: 'N48', label: 'ظرفیت محاسبه‌شده', unit: 'kg' },
        { cell: 'R48', label: 'تعداد نفر متناظر', unit: 'نفر' },
        { cell: 'N51', label: 'ظرفیت جایگزین طبق جدول مساحت', unit: 'kg' },
        { cell: 'R51', label: 'تعداد نفرِ ظرفیت جایگزین', unit: 'نفر' },
        { cell: 'R54', label: 'حداقل عرض چاه برای درب انتخابی', unit: 'cm' },
        { cell: 'N54', label: 'کنترل تطابق ورودی‌ها' },
      ],
    },
  },
  {
    id: 'hydraulic', group: 'capacity', title: 'ظرفیت آسانسور هیدرولیک',
    description: 'محاسبهٔ ابعاد کابین و ظرفیت هیدرولیک طبق قواعد و جدول‌های مهندسی کاماک.',
    fields: [
      { cell: 'N62', label: 'عرض چاه', unit: 'cm', type: 'number' },
      { cell: 'O62', label: 'طول چاه', unit: 'cm', type: 'number' },
      { cell: 'P62', label: 'نوع درب', type: 'select', options: doorTypes },
      { cell: 'Q62', label: 'تعداد درب کابین', unit: 'درب', type: 'select', options: cabinDoors },
      { cell: 'R62', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'S62', label: 'تعداد لته', unit: 'لته', type: 'select', options: leaves },
      { cell: 'T62', label: 'دماغهٔ کابین', hint: noseHint, unit: 'cm', type: 'select', options: noseSizes },
      { cell: 'U62', label: 'جانمایی جک', type: 'select', options: ['مرکز', 'پشت', 'بغل'] },
    ],
    presentation: {
      type: 'metrics',
      metrics: [
        { cell: 'N64', label: 'مساحت کابین', unit: 'm²', featured: true },
        { cell: 'R64', label: 'عرض کابین', unit: 'cm' },
        { cell: 'T64', label: 'طول کابین', unit: 'cm' },
        { cell: 'N67', label: 'ظرفیت محاسبه‌شده', unit: 'kg' },
        { cell: 'R67', label: 'تعداد نفر متناظر', unit: 'نفر' },
        { cell: 'N70', label: 'ظرفیت جایگزین طبق جدول مساحت', unit: 'kg' },
        { cell: 'R70', label: 'تعداد نفرِ ظرفیت جایگزین', unit: 'نفر' },
        { cell: 'R73', label: 'حداقل عرض چاه برای درب انتخابی', unit: 'cm' },
        { cell: 'N73', label: 'کنترل تطابق ورودی‌ها' },
      ],
    },
  },
  {
    id: 'iron', group: 'materials', title: 'لیست آهن‌آلات آسانسور',
    description: 'مقادیر آهن‌آلات و برآورد قیمتِ گزینه‌های نبشی ۸، ۱۰ و ۱۲ را با ضرایب و فرمول‌های مهندسی کاماک محاسبه می‌کند.',
    fields: [
      { cell: 'W5', label: 'عرض چاه', unit: 'cm', type: 'number' },
      { cell: 'X5', label: 'طول چاه چپ', unit: 'cm', type: 'number' },
      { cell: 'Y5', label: 'طول چاه راست', unit: 'cm', type: 'number' },
      { cell: 'AD18', label: 'تعداد توقف', unit: 'توقف', type: 'number' },
      { cell: 'AB18', label: 'کف تا کف', unit: 'm', type: 'select', options: floorToFloorOptions },
      { cell: 'Y18', label: 'تفاوت سقف بلندتر', hint: 'اگر تمام کف‌تا‌کف‌ها یکی است، عدد صفر وارد کنید', unit: 'm', type: 'number' },
      { cell: 'AB5', label: 'جانمایی وزنه', type: 'select', options: layouts },
      { cell: 'AF5', label: 'تعداد درب', type: 'select', options: cabinDoors },
      { cell: 'AG5', label: 'تعداد اضلاع نبشی', type: 'select', options: ['چهار ضلع نبشی', 'سه ضلع نبشی', 'دو ضلع نبشی'] },
      { cell: 'AF18', label: 'نوع آسانسور', type: 'select', options: ['گیربکس', 'گیرلس', 'روملس'] },
      { cell: 'Z8', label: 'اندازهٔ نبشی', type: 'select', options: ['نبشی 8', 'نبشی 10', 'نبشی 12'] },
      { cell: 'AD23', label: 'قیمت هر کیلو آهن', type: 'number' },
    ],
    presentation: {
      type: 'iron-schedule',
      metrics: [
        { cell: 'W18', label: 'ارتفاع کل چاه', unit: 'm', featured: true },
        { cell: 'AD21', label: 'تعداد کلاف', unit: 'ردیف' },
        { cell: 'W21', label: 'یادداشت کنترل شاخه‌بندی' },
      ],
      materialRows: [8, 9, 10, 11, 12, 13, 14, 15, 16],
      priceRows: [23, 24, 25],
      priceDiffs: [
        { cell: 'W27', labelCell: 'Z27' },
        { cell: 'AC27', labelCell: 'AE27' },
      ],
    },
  },
  {
    id: 'slab', group: 'materials', title: 'لوازم دال بتنی',
    description: 'تعداد و اندازهٔ اقلام دال را از ابعاد چاه و نوع آسانسور به دست می‌آورد.',
    fields: [
      { cell: 'AI5', label: 'نوع آسانسور', type: 'select', options: ['گیربکس', 'گیرلس 1:1', 'گیرلس'] },
      { cell: 'AJ5', label: 'عرض چاه', unit: 'cm', type: 'number' },
      { cell: 'AL5', label: 'طول چاه', unit: 'cm', type: 'number' },
    ],
    presentation: {
      type: 'slab-materials',
      metrics: [
        { cell: 'AK5', label: 'عرض داخل‌به‌داخل تیرآهن', unit: 'cm' },
        { cell: 'AM5', label: 'طول داخل‌به‌داخل تیرآهن', unit: 'cm' },
      ],
      materialRows: [8, 9, 10, 11, 12, 13, 14, 15, 16],
    },
  },
  {
    id: 'door-steel', group: 'materials', title: 'آهن‌آلات نصب درب',
    description: 'طول، نوع و تعداد آهن‌های نصب درب را برای عرض چاه، تعداد توقف و وضعیت پاچلاقی محاسبه می‌کند.',
    fields: [
      { cell: 'AO5', label: 'عرض چاه', unit: 'cm', type: 'number' },
      { cell: 'AP5', label: 'تعداد توقف', unit: 'توقف', type: 'number' },
      { cell: 'AQ5', label: 'نوع درب', type: 'select', options: ['اتومات', 'لولایی'] },
      { cell: 'AR5', label: 'عرض درب', unit: 'cm', type: 'select', options: doorWidths },
      { cell: 'AS5', label: 'حالت پاچلاقی', type: 'select', options: ['دارد', 'ندارد'] },
      { cell: 'AT5', label: 'عقب‌رفتگی نبشی', unit: 'cm', type: 'number' },
    ],
    presentation: { type: 'door-steel', materialRows: [8, 9, 10, 11] },
  },
  {
    id: 'travel-time', group: 'travel', title: 'زمان سفر بین طبقات',
    description: 'زمان رفت‌وآمد را از تعداد طبقات، ارتفاع طبقات و زمان عملکرد درب‌ها محاسبه می‌کند.',
    fields: [
      { cell: 'AV5', label: 'تعداد طبقات', unit: 'طبقه', type: 'number' },
      { cell: 'AW5', label: 'فاصلهٔ کف تا کف', unit: 'm', type: 'number' },
      { cell: 'AX5', label: 'ارتفاع سقف بلندتر', unit: 'm', type: 'number' },
      { cell: 'AY5', label: 'زمان بسته‌شدن درب', unit: 's', type: 'number' },
      { cell: 'AZ5', label: 'زمان بازشدن درب', unit: 's', type: 'number' },
    ],
    presentation: {
      type: 'travel-time',
      metrics: [
        { cell: 'AV7', labelCell: 'AY7', unit: 's', featured: true, formulaSpeed: '1 m/s' },
        { cell: 'AV9', labelCell: 'AY9', unit: 's', formulaSpeed: '1.6 m/s' },
        { cell: 'AV11', labelCell: 'AY11', unit: 's', featured: true, formulaSpeed: '2.5 m/s' },
      ],
    },
  },
];
