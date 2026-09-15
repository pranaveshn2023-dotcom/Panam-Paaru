/**
 * Comprehensive Directory & Intelligent Auto-Detector for all Indian & Global Brokers,
 * Depositories (CAMS/KFintech/CDSL/NSDL), AMCs, Crypto Exchanges & Banks.
 */

export interface BrokerGuide {
  id: string;
  name: string;
  shortName: string;
  category: 'Depositories & CAS' | 'Discount Brokers' | 'Full-Service & Banking' | 'Crypto Platforms' | 'Other / Generic';
  iconBg: string;
  iconText: string;
  keywords: string[];
  filePatterns: RegExp[];
  contentPatterns: RegExp[];
  supportedFormats: string[];
  portalUrl?: string;
  passwordFormat?: string;
  exportSteps: string[];
  proTip?: string;
}

export const BROKER_DIRECTORY: BrokerGuide[] = [
  // ── Discount Brokers (Most Popular) ──
  {
    id: 'zerodha',
    name: 'Zerodha (Kite & Console)',
    shortName: 'Zerodha',
    category: 'Discount Brokers',
    iconBg: '#387ED1',
    iconText: 'Z',
    keywords: ['zerodha', 'kite', 'console.zerodha', 'zerodha broking'],
    filePatterns: [/zerodha/i, /kite/i, /console.*holdings/i],
    contentPatterns: [/zerodha/i, /kite/i, /console\.zerodha\.com/i, /equity_holdings/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://console.zerodha.com/portfolio/holdings',
    exportSteps: [
      'Log in to console.zerodha.com with your Kite credentials.',
      'Go to "Portfolio" from the top menu and select "Holdings".',
      'Click the "Download" button on the top right corner and choose "XLSX" or "CSV".',
      'Alternatively, export your Coin mutual fund holdings from console.zerodha.com/coin.',
      'Upload the downloaded file directly into Paanam.',
    ],
    proTip: 'You can also simply select all rows on the Kite Holdings webpage, press Ctrl+C, click "Paste Table", and press Ctrl+V!',
  },
  {
    id: 'groww',
    name: 'Groww',
    shortName: 'Groww',
    category: 'Discount Brokers',
    iconBg: '#00D09C',
    iconText: 'M',
    keywords: ['groww', 'nextbillion', 'groww.in'],
    filePatterns: [/groww/i, /nextbillion/i],
    contentPatterns: [/groww/i, /nextbillion technology/i, /groww\.in/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://groww.in/user/profile/reports',
    exportSteps: [
      'Open the Groww App or web portal at groww.in.',
      'Click on your profile avatar (top right) and choose "Reports".',
      'Select "Stocks P&L" or "Mutual Funds Report".',
      'Select the financial year / current date and click "Download Report" (Excel or PDF).',
      'Upload the statement file directly into Paanam.',
    ],
    proTip: 'Groww exports separate reports for Stocks and Mutual Funds — Paanam seamlessly aggregates both into your unified net worth.',
  },
  {
    id: 'indmoney',
    name: 'INDmoney',
    shortName: 'INDmoney',
    category: 'Discount Brokers',
    iconBg: '#121212',
    iconText: '↑',
    keywords: ['indmoney', 'finzoom'],
    filePatterns: [/indmoney/i, /finzoom/i],
    contentPatterns: [/indmoney/i, /finzoom investment/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.indmoney.com',
    exportSteps: [
      'Open the INDmoney app or log in at indmoney.com.',
      'Go to Profile > "Statements & Reports".',
      'Choose "Indian Stocks & Mutual Funds Holding Statement".',
      'Click "Download Excel / PDF".',
      'Import the file into Paanam.',
    ],
  },
  {
    id: 'upstox',
    name: 'Upstox (RKSV)',
    shortName: 'Upstox',
    category: 'Discount Brokers',
    iconBg: '#5A2E8A',
    iconText: 'U',
    keywords: ['upstox', 'rksv'],
    filePatterns: [/upstox/i, /rksv/i],
    contentPatterns: [/upstox/i, /rksv securities/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://pro.upstox.com',
    exportSteps: [
      'Log in to pro.upstox.com or the Upstox App.',
      'Navigate to Profile > "Reports & Corporate Actions".',
      'Select "Holdings" or "Tax P&L".',
      'Click "Export to Excel" or "Download CSV".',
      'Upload the exported file here.',
    ],
  },
  {
    id: 'icici_direct',
    name: 'ICICI Direct',
    shortName: 'ICICI Direct',
    category: 'Full-Service & Banking',
    iconBg: '#F37021',
    iconText: 'i',
    keywords: ['icici', 'icicidirect', 'icici securities'],
    filePatterns: [/icici/i, /direct/i],
    contentPatterns: [/icici direct/i, /icici securities/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://secure.icicidirect.com',
    exportSteps: [
      'Log in to ICICI Direct portal.',
      'Go to "Portfolio" > "Equity" or "Mutual Funds".',
      'Click "Download Portfolio to Excel" on the top right.',
      'Upload the spreadsheet file here.',
    ],
  },
  {
    id: 'cdsl_ecas',
    name: 'CDSL eCAS (Central Depository)',
    shortName: 'CDSL',
    category: 'Depositories & CAS',
    iconBg: '#1A56A0',
    iconText: '▣',
    keywords: ['cdsl', 'ecas', 'cdslindia', 'central depository services'],
    filePatterns: [/cdsl/i, /ecas/i],
    contentPatterns: [/central depository services/i, /cdsl/i, /bo id/i, /dp id.*120\d{5}/i],
    supportedFormats: ['.pdf'],
    portalUrl: 'https://web.cdslindia.com/myeasinew/',
    passwordFormat: 'First 5 characters of PAN in UPPERCASE + last 4 digits of Demat BO ID, or 8-digit DOB (DDMMYYYY)',
    exportSteps: [
      'Log in to CDSL easiest / myeasie portal (or check your monthly eCAS email).',
      'Download your monthly Consolidated Account Statement (eCAS PDF).',
      'Upload the PDF directly into Paanam.',
    ],
    proTip: 'CDSL holds your direct equity shares, ETFs, and Demat mutual funds across Zerodha, Groww, Angel One, and other CDSL brokers.',
  },
  {
    id: 'angel_one',
    name: 'Angel One (SmartAPI)',
    shortName: 'Angel One',
    category: 'Discount Brokers',
    iconBg: '#D8232A',
    iconText: 'Δ',
    keywords: ['angel', 'angelone', 'angel broking'],
    filePatterns: [/angel/i, /angelone/i],
    contentPatterns: [/angel one/i, /angel broking/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://trade.angelone.in',
    exportSteps: [
      'Log in to trade.angelone.in or the Angel One App.',
      'Navigate to "Portfolio" > "All Holdings".',
      'Click the "Download" icon (Excel or CSV) in the top toolbar.',
      'Upload the spreadsheet file to Paanam.',
    ],
  },
  {
    id: 'dhan',
    name: 'Dhan',
    shortName: 'Dhan',
    category: 'Discount Brokers',
    iconBg: '#13B156',
    iconText: 'D',
    keywords: ['dhan', 'raise financial'],
    filePatterns: [/dhan/i],
    contentPatterns: [/dhan/i, /raise financial services/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://web.dhan.co',
    exportSteps: [
      'Log in to web.dhan.co.',
      'Go to "Money" or "Portfolio" > "Account Statements".',
      'Select "Equity Holdings Statement" or "Portfolio Snapshot".',
      'Click "Download as CSV / Excel".',
      'Upload the file here.',
    ],
  },
  {
    id: 'cams_kfintech',
    name: 'CAMS & KFintech CAS (MFCentral)',
    shortName: 'CAMS / KFintech CAS',
    category: 'Depositories & CAS',
    iconBg: '#1D4ED8',
    iconText: 'C',
    keywords: ['cams', 'kfintech', 'karvy', 'mfcentral', 'camsonline', 'consolidated account statement'],
    filePatterns: [/cams/i, /kfin/i, /karvy/i, /cas[_-]/i, /mfcentral/i],
    contentPatterns: [/computer age management/i, /kfin technologies/i, /consolidated account statement/i, /camsonline/i, /mfs\.kfintech/i],
    supportedFormats: ['.pdf (CAS)', '.xlsx', '.csv'],
    portalUrl: 'https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement',
    passwordFormat: 'PAN in UPPERCASE (e.g. ABCDE1234F) or Date of Birth (DDMMYYYY)',
    exportSteps: [
      'Visit CAMS Online, KFintech, or MFCentral statement portal.',
      'Select "Consolidated Account Statement (CAS) - Detailed".',
      'Choose "Specific Period" (or All Time) and enter your registered Email & PAN.',
      'Set a statement password (or use your PAN in UPPERCASE) and click Submit.',
      'Check your email inbox, download the encrypted PDF statement, and upload it directly here in Paanam.',
    ],
    proTip: 'CAMS & KFintech CAS consolidates 100% of your mutual funds across all AMCs in India in one statement.',
  },
  {
    id: 'nsdl_ecas',
    name: 'NSDL eCAS (National Securities Depository)',
    shortName: 'NSDL',
    category: 'Depositories & CAS',
    iconBg: '#004B87',
    iconText: 'N',
    keywords: ['nsdl', 'speed-e', 'nsdleservices', 'national securities depository'],
    filePatterns: [/nsdl/i, /ecas/i],
    contentPatterns: [/national securities depository/i, /nsdl/i, /dp id.*in30\d{4}/i],
    supportedFormats: ['.pdf'],
    portalUrl: 'https://nsdl.co.in/cas/',
    passwordFormat: '10-digit PAN in UPPERCASE (e.g. ABCDE1234F) or 8-digit DOB (DDMMYYYY)',
    exportSteps: [
      'Open the monthly NSDL eCAS email sent from nsdl-cas@nsdl.co.in.',
      'Download the attached encrypted eCAS statement PDF.',
      'Upload it to Paanam and enter your PAN password when prompted.',
    ],
  },
  {
    id: 'hdfc_sky',
    name: 'HDFC Sky / HDFC Securities',
    shortName: 'HDFC Sky',
    category: 'Full-Service & Banking',
    iconBg: '#004C8F',
    iconText: 'H',
    keywords: ['hdfc', 'hdfcsky', 'hdfcsec', 'hdfc securities'],
    filePatterns: [/hdfc/i, /sky/i],
    contentPatterns: [/hdfc sky/i, /hdfc securities/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://hdfcsky.com',
    exportSteps: [
      'Log in to HDFC Sky or HDFC Securities web/app.',
      'Navigate to Profile > "Reports & Statements".',
      'Select "Holdings & Portfolio" and click Download Excel.',
      'Import the file into Paanam.',
    ],
  },
  {
    id: 'kotak_securities',
    name: 'Kotak Securities / Cherry',
    shortName: 'Kotak Securities',
    category: 'Full-Service & Banking',
    iconBg: '#ED1C24',
    iconText: 'K',
    keywords: ['kotak', 'kotaksec', 'cherry', 'kotak neo'],
    filePatterns: [/kotak/i, /cherry/i, /neo/i],
    contentPatterns: [/kotak securities/i, /kotak mahindra/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.kotaksecurities.com',
    exportSteps: [
      'Log in to Kotak Neo or Kotak Securities.',
      'Go to Portfolio > "Holdings" > Click "Download as Excel".',
    ],
  },
  {
    id: 'axis_direct',
    name: 'Axis Direct',
    shortName: 'Axis Direct',
    category: 'Full-Service & Banking',
    iconBg: '#97144D',
    iconText: 'A',
    keywords: ['axis', 'axisdirect', 'axis securities'],
    filePatterns: [/axis/i],
    contentPatterns: [/axis direct/i, /axis securities/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://simplehai.axisdirect.in',
    exportSteps: [
      'Log in to Axis Direct portal.',
      'Go to Reports > Portfolio > Equity / MF Holdings.',
      'Export to Excel or CSV.',
    ],
  },
  {
    id: 'sbi_securities',
    name: 'SBI Securities (SBICAP)',
    shortName: 'SBI Securities',
    category: 'Full-Service & Banking',
    iconBg: '#280071',
    iconText: 'S',
    keywords: ['sbi', 'sbicap', 'sbisec'],
    filePatterns: [/sbi/i, /sbicap/i],
    contentPatterns: [/sbi securities/i, /sbicap securities/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.sbisecurities.in',
    exportSteps: [
      'Log in to SBI Securities portal.',
      'Go to Reports > My Holdings > Export to Excel.',
    ],
  },
  {
    id: 'motilal_oswal',
    name: 'Motilal Oswal (MOFSL)',
    shortName: 'Motilal Oswal',
    category: 'Full-Service & Banking',
    iconBg: '#EF4444',
    iconText: 'M',
    keywords: ['motilal', 'mofsl', 'oswal'],
    filePatterns: [/motilal/i, /mofsl/i],
    contentPatterns: [/motilal oswal/i, /mofsl/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.motilaloswal.com',
    exportSteps: [
      'Log in to Motilal Oswal online portal.',
      'Go to Reports > Portfolio Summary > Download Excel.',
    ],
  },
  {
    id: 'sharekhan',
    name: 'Sharekhan (BNP Paribas)',
    shortName: 'Sharekhan',
    category: 'Full-Service & Banking',
    iconBg: '#F59E0B',
    iconText: 'S',
    keywords: ['sharekhan', 'bnp paribas'],
    filePatterns: [/sharekhan/i],
    contentPatterns: [/sharekhan/i, /bnp paribas/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.sharekhan.com',
    exportSteps: [
      'Log in to Sharekhan > Reports > Equity Holdings.',
      'Click Download to Excel.',
    ],
  },
  {
    id: '5paisa',
    name: '5paisa Capital',
    shortName: '5paisa',
    category: 'Discount Brokers',
    iconBg: '#FF5722',
    iconText: '5',
    keywords: ['5paisa', 'fivepaisa'],
    filePatterns: [/5paisa/i],
    contentPatterns: [/5paisa capital/i, /5paisa/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.5paisa.com',
    exportSteps: [
      'Log in to 5paisa.com > My Account.',
      'Go to Reports > Portfolio Summary / Holding Statement.',
      'Export as Excel (.xlsx) or CSV.',
    ],
  },
  {
    id: 'paytm_money',
    name: 'Paytm Money',
    shortName: 'Paytm Money',
    category: 'Discount Brokers',
    iconBg: '#002E6E',
    iconText: 'P',
    keywords: ['paytm', 'paytmmoney'],
    filePatterns: [/paytm/i],
    contentPatterns: [/paytm money/i, /one97/i],
    supportedFormats: ['.pdf', '.xlsx', '.csv'],
    portalUrl: 'https://www.paytmmoney.com',
    exportSteps: [
      'Open the Paytm Money App > Tap Profile.',
      'Select "Statements" > "Portfolio Statement" or "Mutual Fund Statement".',
      'Select duration and download the PDF or Excel.',
    ],
  },
  {
    id: 'kuvera',
    name: 'Kuvera',
    shortName: 'Kuvera',
    category: 'Discount Brokers',
    iconBg: '#3B82F6',
    iconText: 'K',
    keywords: ['kuvera', 'arevuk'],
    filePatterns: [/kuvera/i],
    contentPatterns: [/kuvera/i, /arevuk advisory/i],
    supportedFormats: ['.xlsx', '.csv'],
    portalUrl: 'https://kuvera.in',
    exportSteps: [
      'Log in to kuvera.in.',
      'Go to Settings / Profile > "Reports".',
      'Click "Tradebook / Holdings" and download the Excel file.',
    ],
  },
  {
    id: 'fyers',
    name: 'Fyers',
    shortName: 'Fyers',
    category: 'Discount Brokers',
    iconBg: '#0284C7',
    iconText: 'F',
    keywords: ['fyers'],
    filePatterns: [/fyers/i],
    contentPatterns: [/fyers securities/i, /fyers/i],
    supportedFormats: ['.csv', '.xlsx'],
    portalUrl: 'https://trade.fyers.in',
    exportSteps: [
      'Log in to Fyers Web or App.',
      'Go to Dashboard > "Portfolio" > "Holdings".',
      'Click the Export CSV button in the upper toolbar.',
    ],
  },
  {
    id: 'shoonya',
    name: 'Shoonya (Finvasia)',
    shortName: 'Shoonya',
    category: 'Discount Brokers',
    iconBg: '#10B981',
    iconText: 'S',
    keywords: ['shoonya', 'finvasia'],
    filePatterns: [/shoonya/i, /finvasia/i],
    contentPatterns: [/shoonya/i, /finvasia/i],
    supportedFormats: ['.csv', '.xlsx'],
    portalUrl: 'https://shoonya.com',
    exportSteps: [
      'Log in to Shoonya Prism Backoffice.',
      'Go to Reports > Holdings Report.',
      'Click "Export to CSV" or "Excel".',
    ],
  },
  {
    id: 'mirae_mstock',
    name: 'm.Stock (Mirae Asset)',
    shortName: 'm.Stock',
    category: 'Full-Service & Banking',
    iconBg: '#C2410C',
    iconText: 'm',
    keywords: ['mstock', 'mirae', 'mirae asset'],
    filePatterns: [/mstock/i, /mirae/i],
    contentPatterns: [/m\.stock/i, /mirae asset capital/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.mstock.com',
    exportSteps: [
      'Log in to m.Stock portal.',
      'Navigate to Reports > Holdings Statement > Download Excel.',
    ],
  },
  {
    id: 'nuvama',
    name: 'Nuvama Wealth (Edelweiss)',
    shortName: 'Nuvama',
    category: 'Full-Service & Banking',
    iconBg: '#4F46E5',
    iconText: 'N',
    keywords: ['nuvama', 'edelweiss'],
    filePatterns: [/nuvama/i, /edelweiss/i],
    contentPatterns: [/nuvama wealth/i, /edelweiss/i],
    supportedFormats: ['.xlsx', '.csv', '.pdf'],
    portalUrl: 'https://www.nuvamawealth.com',
    exportSteps: [
      'Log in to Nuvama portal > Reports > Portfolio Summary > Export Excel.',
    ],
  },
  {
    id: 'coindcx',
    name: 'CoinDCX',
    shortName: 'CoinDCX',
    category: 'Crypto Platforms',
    iconBg: '#2563EB',
    iconText: '₿',
    keywords: ['coindcx', 'primestack'],
    filePatterns: [/coindcx/i],
    contentPatterns: [/coindcx/i, /primestack/i],
    supportedFormats: ['.csv', '.xlsx'],
    portalUrl: 'https://coindcx.com',
    exportSteps: [
      'Log in to CoinDCX > Profile > "Download Reports".',
      'Select "Portfolio Allocation" or "Transaction History" and download CSV.',
    ],
  },
  {
    id: 'wazirx',
    name: 'WazirX',
    shortName: 'WazirX',
    category: 'Crypto Platforms',
    iconBg: '#3B82F6',
    iconText: 'W',
    keywords: ['wazirx', 'zanmai'],
    filePatterns: [/wazirx/i],
    contentPatterns: [/wazirx/i, /zanmai labs/i],
    supportedFormats: ['.csv'],
    portalUrl: 'https://wazirx.com',
    exportSteps: [
      'Go to Account Settings > "Download Trading Report".',
      'Request CSV export and upload it here.',
    ],
  },
  {
    id: 'binance',
    name: 'Binance',
    shortName: 'Binance',
    category: 'Crypto Platforms',
    iconBg: '#F59E0B',
    iconText: 'B',
    keywords: ['binance'],
    filePatterns: [/binance/i],
    contentPatterns: [/binance/i],
    supportedFormats: ['.csv', '.xlsx'],
    portalUrl: 'https://www.binance.com',
    exportSteps: [
      'Go to Wallet > Transaction History > "Generate Statement" (CSV).',
    ],
  },
  {
    id: 'bank_statement',
    name: 'Bank Statement (All Banks)',
    shortName: 'Bank Statement',
    category: 'Other / Generic',
    iconBg: '#374151',
    iconText: '🏦',
    keywords: ['bank', 'statement', 'account statement', 'passbook'],
    filePatterns: [/bank/i, /statement/i, /passbook/i],
    contentPatterns: [/account statement/i, /account balance/i, /opening balance/i, /closing balance/i],
    supportedFormats: ['.pdf', '.xlsx', '.csv'],
    exportSteps: [
      'Log in to your bank internet banking or mobile app.',
      'Go to Accounts > "Account Statement" or "Detailed Statement".',
      'Download as PDF, Excel (.xlsx), or CSV.',
      'Upload the file here to extract all financial holding and cash flow entries.',
    ],
  },

  // ── Universal Other / Statement Fallback ──
  {
    id: 'other_broker',
    name: 'Other Broker / Custom Statement',
    shortName: 'Other Broker / Statement',
    category: 'Other / Generic',
    iconBg: '#6B7280',
    iconText: '🌐',
    keywords: ['other', 'generic', 'statement', 'broker', 'unknown', 'custom'],
    filePatterns: [],
    contentPatterns: [],
    supportedFormats: ['.pdf', '.xlsx', '.xls', '.csv', '.tsv', '.docx'],
    exportSteps: [
      'Export any holdings statement, portfolio valuation, or transaction sheet from your broker or bank.',
      'Upload the file (.pdf, .xlsx, .csv, .docx) or paste rows directly into Paanam.',
      'Paanam prioritizes financial numbers (invested amounts, values, units, live NAV) above all else.',
    ],
    proTip: 'Even if your broker is not listed, Paanam parses and calculates all financial details dynamically.',
  },
];

export const ALL_BROKER_OPTIONS: string[] = [
  'Auto-Detect Broker',
  ...BROKER_DIRECTORY.map((b) => b.shortName),
];

export function getBrokerIcon(shortName: string): { bg: string; text: string } {
  const found = BROKER_DIRECTORY.find(
    (b) => b.shortName.toLowerCase() === shortName.toLowerCase() || b.name.toLowerCase() === shortName.toLowerCase()
  );
  if (found) {
    return { bg: found.iconBg, text: found.iconText };
  }
  return { bg: '#6B7280', text: (shortName || 'O').slice(0, 1).toUpperCase() };
}

/**
 * Intelligent Broker Auto-Detector:
 * Analyzes the file name, internal sheet names, header rows, and document text
 * to determine the exact broker or depository.
 */
export function detectBrokerFromFile(
  fileName?: string,
  rawContent?: { sheets?: { sheetName: string; rows: any[][] }[] },
  textSnippet?: string
): string | null {
  const safeName = (fileName || '').toLowerCase();
  const safeSnippet = (textSnippet || '').toLowerCase();

  let sheetText = '';
  if (rawContent?.sheets) {
    for (const sheet of rawContent.sheets) {
      sheetText += ` ${sheet.sheetName.toLowerCase()}`;
      const sampleRows = (sheet.rows || []).slice(0, 15);
      for (const row of sampleRows) {
        sheetText += ` ${row.join(' ').toLowerCase()}`;
      }
    }
  }

  const combinedSearchSpace = `${safeName} ${sheetText} ${safeSnippet}`;

  for (const broker of BROKER_DIRECTORY) {
    if (broker.id === 'other_broker') continue;

    // 1. Check file patterns
    for (const pat of broker.filePatterns) {
      if (pat.test(safeName)) return broker.shortName;
    }

    // 2. Check content patterns
    for (const pat of broker.contentPatterns) {
      if (pat.test(combinedSearchSpace)) return broker.shortName;
    }

    // 3. Keyword scan
    for (const kw of broker.keywords) {
      if (combinedSearchSpace.includes(kw.toLowerCase())) {
        return broker.shortName;
      }
    }
  }

  return null;
}

export function getBrokerGuide(brokerShortName: string): BrokerGuide | undefined {
  return BROKER_DIRECTORY.find(
    (b) => b.shortName.toLowerCase() === brokerShortName.toLowerCase() || b.name.toLowerCase() === brokerShortName.toLowerCase()
  );
}
