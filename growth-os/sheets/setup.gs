/**
 * SparkConnect Growth OS — Command Center Builder
 * ------------------------------------------------
 * One-time setup script. Builds all 11 tabs with headers, formatting,
 * and a live Dashboard. Idempotent: safe to re-run (it will not delete
 * data, only ensure tabs/headers exist).
 *
 * HOW TO USE
 *   1. Create a blank Google Sheet.
 *   2. Extensions > Apps Script.
 *   3. Paste this entire file, Save, then run `buildCommandCenter`.
 *   4. Approve the permission prompt (it only touches THIS spreadsheet).
 *   5. Copy the Spreadsheet ID from the URL and send it to your ops engineer.
 *
 * NO API KEYS. NO EXTERNAL CALLS. This script only edits this spreadsheet.
 */

// ----- Tab definitions (column headers) ------------------------------------
var TABS = {
  'Daily Metrics': [
    'Date', 'Installs', 'Active Users', 'Sparky Messages', 'Paywalls Shown',
    'Trials Started', 'Paid Conversions', 'Cancellations', 'Net New Paid',
    'Content Published', 'Bugs Logged', 'Feedback Count', 'Notes'
  ],
  'Content Queue': [
    'ID', 'Date Added', 'Topic', 'Platform', 'Status', 'Hook', 'Angle',
    'Owner', 'Draft Link', 'Approved By', 'Publish Date', 'Notes'
  ],
  'Creator Leads': [
    'Date', 'Name', 'Handle', 'Platform', 'Followers', 'Niche',
    'Contact', 'Status', 'Source', 'Notes'
  ],
  'Trade School Leads': [
    'Date', 'School Name', 'Contact Name', 'Role', 'Email', 'Phone',
    'State', 'Program Size', 'Status', 'Notes'
  ],
  'Contractor Leads': [
    'Date', 'Company', 'Contact Name', 'Trade', 'Crew Size', 'Email',
    'Phone', 'State', 'Status', 'Source', 'Notes'
  ],
  'Feedback': [
    'ID', 'Date', 'Source', 'Raw Text', 'Category', 'Sentiment',
    'User Contact', 'Status', 'Linked Item', 'Notes'
  ],
  'Bugs': [
    'ID', 'Date', 'Reported By', 'Severity', 'Area', 'Description',
    'Steps to Reproduce', 'Status', 'Priority', 'Notion Link', 'Notes'
  ],
  'Feature Requests': [
    'ID', 'Date', 'Requested By', 'Title', 'Description', 'Votes',
    'Status', 'Priority', 'Notion Link', 'Notes'
  ],
  'Revenue': [
    'Date', 'Event Type', 'Product ID', 'Store', 'Amount (USD)', 'Currency',
    'Customer (hashed)', 'MRR Delta', 'Active Subs', 'Notes'
  ],
  'Experiments': [
    'ID', 'Start Date', 'Name', 'Hypothesis', 'Metric', 'Variant A',
    'Variant B', 'Status', 'Result', 'Decision', 'Notes'
  ]
};

// Dropdown options per (tab -> header -> options)
var VALIDATIONS = {
  'Content Queue': {
    'Status': ['Idea', 'Drafting', 'Draft Ready', 'Approved', 'Scheduled', 'Published', 'Killed'],
    'Platform': ['TikTok', 'Instagram', 'YouTube Shorts', 'X', 'LinkedIn', 'Multi']
  },
  'Feedback': {
    'Category': ['Bug', 'Feature Request', 'UX Issue', 'Testimonial', 'Pricing Complaint', 'Content Idea'],
    'Sentiment': ['Positive', 'Neutral', 'Negative'],
    'Status': ['New', 'Triaged', 'Actioned', 'Closed']
  },
  'Bugs': {
    'Severity': ['Critical', 'High', 'Medium', 'Low'],
    'Status': ['Open', 'In Progress', 'Fixed', 'Wont Fix'],
    'Priority': ['P0', 'P1', 'P2', 'P3']
  },
  'Feature Requests': {
    'Status': ['New', 'Considering', 'Planned', 'Building', 'Shipped', 'Declined'],
    'Priority': ['P0', 'P1', 'P2', 'P3']
  },
  'Revenue': {
    'Event Type': ['Initial Purchase', 'Renewal', 'Cancellation', 'Refund', 'Message Pack', 'Trial Start', 'Trial Conversion'],
    'Store': ['App Store', 'Play Store', 'Stripe', 'Other']
  },
  'Experiments': {
    'Status': ['Proposed', 'Running', 'Concluded', 'Adopted', 'Rolled Back']
  }
};

var HEADER_BG = '#0A0A0F';
var HEADER_FG = '#FFFFFF';
var ACCENT = '#F5A623';

function buildCommandCenter() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Create / ensure each data tab.
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = TABS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    var head = sheet.getRange(1, 1, 1, headers.length);
    head.setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    applyValidations_(sheet, name, headers);
  });

  // 2. Build the Dashboard last so it can reference the others.
  buildDashboard_(ss);

  // 3. Order tabs: Dashboard first.
  var dash = ss.getSheetByName('Dashboard');
  if (dash) ss.setActiveSheet(dash); ss.moveActiveSheet(1);

  SpreadsheetApp.getUi().alert('SparkConnect Command Center built. Copy the Spreadsheet ID from the URL and send it to your ops engineer.');
}

function applyValidations_(sheet, name, headers) {
  var rules = VALIDATIONS[name];
  if (!rules) return;
  Object.keys(rules).forEach(function (header) {
    var col = headers.indexOf(header) + 1;
    if (col < 1) return;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(rules[header], true)
      .setAllowInvalid(true)
      .build();
    sheet.getRange(2, col, 500, 1).setDataValidation(rule);
  });
}

function buildDashboard_(ss) {
  var name = 'Dashboard';
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  sheet.getRange('A1').setValue('SparkConnect Growth OS — Dashboard')
    .setFontSize(18).setFontWeight('bold').setFontColor(ACCENT);
  sheet.getRange('A2').setValue('Auto-updates from the data tabs. Yesterday = TODAY()-1.')
    .setFontColor('#888888');

  var rows = [
    ['KPI', 'Value'],
    ['Installs (yesterday)',        '=IFERROR(SUMIFS(\'Daily Metrics\'!B:B,\'Daily Metrics\'!A:A,TODAY()-1),0)'],
    ['Installs (last 7d)',          '=IFERROR(SUMIFS(\'Daily Metrics\'!B:B,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Installs (last 30d)',         '=IFERROR(SUMIFS(\'Daily Metrics\'!B:B,\'Daily Metrics\'!A:A,">="&TODAY()-30),0)'],
    ['Trials started (last 7d)',    '=IFERROR(SUMIFS(\'Daily Metrics\'!F:F,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Paid conversions (last 7d)',  '=IFERROR(SUMIFS(\'Daily Metrics\'!G:G,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Active paid subscribers',     '=IFERROR(MAX(0,SUMIF(Revenue!H:H,"<>")),0)'],
    ['Estimated MRR (USD)',         '=IFERROR(SUM(Revenue!H:H),0)'],
    ['Content published (last 7d)', '=IFERROR(COUNTIFS(\'Content Queue\'!E:E,"Published",\'Content Queue\'!K:K,">="&TODAY()-7),0)'],
    ['Content in queue (idea/draft)','=IFERROR(COUNTIF(\'Content Queue\'!E:E,"Idea")+COUNTIF(\'Content Queue\'!E:E,"Drafting")+COUNTIF(\'Content Queue\'!E:E,"Draft Ready"),0)'],
    ['Open bugs',                   '=IFERROR(COUNTIF(Bugs!H:H,"Open")+COUNTIF(Bugs!H:H,"In Progress"),0)'],
    ['Critical/High open bugs',     '=IFERROR(COUNTIFS(Bugs!D:D,"Critical",Bugs!H:H,"Open")+COUNTIFS(Bugs!D:D,"High",Bugs!H:H,"Open"),0)'],
    ['New feedback (last 7d)',      '=IFERROR(COUNTIF(Feedback!B:B,">="&TODAY()-7),0)'],
    ['Open feature requests',       '=IFERROR(COUNTIF(\'Feature Requests\'!G:G,"New")+COUNTIF(\'Feature Requests\'!G:G,"Considering"),0)'],
    ['Creator leads (total)',       '=IFERROR(COUNTA(\'Creator Leads\'!A:A)-1,0)'],
    ['Trade school leads (total)',  '=IFERROR(COUNTA(\'Trade School Leads\'!A:A)-1,0)'],
    ['Contractor leads (total)',    '=IFERROR(COUNTA(\'Contractor Leads\'!A:A)-1,0)'],
    ['Experiments running',         '=IFERROR(COUNTIF(Experiments!H:H,"Running"),0)']
  ];

  sheet.getRange(4, 1, rows.length, 2).setValues(rows);
  sheet.getRange(4, 1, 1, 2).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sheet.getRange(5, 1, rows.length - 1, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 160);
  sheet.setFrozenRows(4);
}
