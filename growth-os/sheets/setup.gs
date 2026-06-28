/**
 * SparkConnect Growth OS — Command Center Builder (execution-first build)
 * ----------------------------------------------------------------------
 * One-time setup. Builds all tabs with headers, dropdowns, and a live
 * Dashboard. Idempotent: safe to re-run (ensures tabs/headers, never deletes data).
 *
 * HOW TO USE
 *   1. Create a blank Google Sheet.
 *   2. Extensions > Apps Script. Paste this file. Save. Run `buildCommandCenter`.
 *   3. Approve the prompt (touches THIS spreadsheet only — no API, no external calls).
 *   4. Copy the Spreadsheet ID from the URL and send it to your ops engineer.
 *
 * Optionally also run `seedContentQueue` after pasting the 14-day rows (see
 * growth-os/content-factory/content-queue-seed.csv) — or just File > Import that CSV.
 */

var TABS = {
  'Content Queue': [
    'ID', 'Day', 'Theme', 'Idea', 'Hook', 'Platform', 'Status',
    'Draft Link', 'Approved By', 'Scheduled Date', 'Notes'
  ],
  'Posted Content': [
    'Date Posted', 'Content ID', 'Platform', 'Hook/Title', 'Link',
    'Views', 'Likes', 'Comments', 'Shares', 'Saves', 'Profile Visits', 'Notes'
  ],
  'Daily Metrics': [
    'Date', 'Views', 'Profile Visits', 'Installs', 'Trials',
    'Paid Subscriptions', 'Packs', 'Revenue (USD)', 'Cancels', 'Feedback Count', 'Notes'
  ],
  'Feedback': [
    'ID', 'Date', 'Source', 'Raw Text', 'Category', 'Sentiment',
    'User Contact', 'Status', 'Linked Item', 'Notes'
  ],
  'Bugs': [
    'ID', 'Date', 'Reported By', 'Severity', 'Area', 'Description',
    'Steps to Reproduce', 'Status', 'Priority', 'Notes'
  ],
  'Feature Requests': [
    'ID', 'Date', 'Requested By', 'Title', 'Description', 'Votes',
    'Status', 'Priority', 'Notes'
  ],
  'Creator / Trade School Leads': [
    'Date', 'Type', 'Name', 'Handle/School', 'Platform', 'Followers/Size',
    'Contact', 'Status', 'Source', 'Notes'
  ],
  'Revenue Snapshot': [
    'Date', 'MRR (USD)', 'Active Subscribers', 'New Trials',
    'Trial Conversions', 'Pack Sales', 'Cancels/Refunds', 'Notes'
  ],
  'Experiments': [
    'ID', 'Start Date', 'Name', 'Hypothesis', 'Metric', 'Variant A',
    'Variant B', 'Status', 'Result', 'Decision', 'Notes'
  ]
};

var VALIDATIONS = {
  'Content Queue': {
    'Status': ['Idea', 'Drafting', 'Draft Ready', 'Approved', 'Scheduled', 'Posted', 'Killed'],
    'Platform': ['TikTok', 'Reels', 'Shorts', 'All']
  },
  'Feedback': {
    'Category': ['Bug', 'Feature Request', 'General'],
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
  'Creator / Trade School Leads': {
    'Type': ['Creator', 'Trade School', 'Contractor'],
    'Status': ['New', 'Contacted', 'Replied', 'Partner', 'Passed']
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
  Object.keys(TABS).forEach(function (name) {
    var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
    var headers = TABS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    applyValidations_(sheet, name, headers);
  });
  buildDashboard_(ss);
  var dash = ss.getSheetByName('Dashboard');
  if (dash) { ss.setActiveSheet(dash); ss.moveActiveSheet(1); }
  SpreadsheetApp.getUi().alert('SparkConnect Command Center built. Copy the Spreadsheet ID from the URL and send it to your ops engineer.');
}

function applyValidations_(sheet, name, headers) {
  var rules = VALIDATIONS[name];
  if (!rules) return;
  Object.keys(rules).forEach(function (header) {
    var col = headers.indexOf(header) + 1;
    if (col < 1) return;
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(rules[header], true).setAllowInvalid(true).build();
    sheet.getRange(2, col, 500, 1).setDataValidation(rule);
  });
}

function buildDashboard_(ss) {
  var sheet = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard');
  sheet.clear();
  sheet.getRange('A1').setValue('SparkConnect Growth OS — Dashboard').setFontSize(18).setFontWeight('bold').setFontColor(ACCENT);
  sheet.getRange('A2').setValue('Auto-updates from the data tabs. "Last 7d" = TODAY()-7.').setFontColor('#888888');

  var rows = [
    ['METRIC', 'VALUE'],
    ['Views (last 7d)',            '=IFERROR(SUMIFS(\'Daily Metrics\'!B:B,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Profile visits (last 7d)',   '=IFERROR(SUMIFS(\'Daily Metrics\'!C:C,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Installs (last 7d)',         '=IFERROR(SUMIFS(\'Daily Metrics\'!D:D,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Trials started (last 7d)',   '=IFERROR(SUMIFS(\'Daily Metrics\'!E:E,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Paid subs added (last 7d)',  '=IFERROR(SUMIFS(\'Daily Metrics\'!F:F,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Packs sold (last 7d)',       '=IFERROR(SUMIFS(\'Daily Metrics\'!G:G,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Revenue (last 7d, USD)',     '=IFERROR(SUMIFS(\'Daily Metrics\'!H:H,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Cancels (last 7d)',          '=IFERROR(SUMIFS(\'Daily Metrics\'!I:I,\'Daily Metrics\'!A:A,">="&TODAY()-7),0)'],
    ['Latest MRR (snapshot)',      '=IFERROR(INDEX(\'Revenue Snapshot\'!B:B,MATCH(MAX(\'Revenue Snapshot\'!A:A),\'Revenue Snapshot\'!A:A,0)),0)'],
    ['Active subscribers (latest)','=IFERROR(INDEX(\'Revenue Snapshot\'!C:C,MATCH(MAX(\'Revenue Snapshot\'!A:A),\'Revenue Snapshot\'!A:A,0)),0)'],
    ['Posts published (last 7d)',  '=IFERROR(COUNTIFS(\'Posted Content\'!A:A,">="&TODAY()-7),0)'],
    ['Ready to post (queue)',      '=IFERROR(COUNTIF(\'Content Queue\'!G:G,"Draft Ready")+COUNTIF(\'Content Queue\'!G:G,"Approved"),0)'],
    ['Open bugs',                  '=IFERROR(COUNTIF(Bugs!H:H,"Open")+COUNTIF(Bugs!H:H,"In Progress"),0)'],
    ['Critical/High open bugs',    '=IFERROR(COUNTIFS(Bugs!D:D,"Critical",Bugs!H:H,"Open")+COUNTIFS(Bugs!D:D,"High",Bugs!H:H,"Open"),0)'],
    ['New feedback (last 7d)',     '=IFERROR(COUNTIF(Feedback!B:B,">="&TODAY()-7),0)'],
    ['Open feature requests',      '=IFERROR(COUNTIF(\'Feature Requests\'!G:G,"New")+COUNTIF(\'Feature Requests\'!G:G,"Considering"),0)'],
    ['Leads (total)',              '=IFERROR(COUNTA(\'Creator / Trade School Leads\'!A:A)-1,0)'],
    ['Experiments running',        '=IFERROR(COUNTIF(Experiments!H:H,"Running"),0)']
  ];
  sheet.getRange(4, 1, rows.length, 2).setValues(rows);
  sheet.getRange(4, 1, 1, 2).setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight('bold');
  sheet.getRange(5, 1, rows.length - 1, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 170);
  sheet.setFrozenRows(4);
}
