import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'jobclip',
  description: 'Capture job postings to Google Sheets with one click',
  version: pkg.version,
  icons: {
    16: 'public/icons/icon-16.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'public/icons/icon-16.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
  },
  options_page: 'src/options/index.html',
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: [
        'https://www.linkedin.com/*',
        'https://*.greenhouse.io/*',
        'https://jobs.lever.co/*',
        'https://*.ashbyhq.com/*',
        'https://*.myworkdayjobs.com/*',
      ],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  permissions: ['storage', 'contextMenus', 'identity', 'activeTab', 'scripting', 'tabs'],
  host_permissions: [
    'https://www.linkedin.com/*',
    'https://*.greenhouse.io/*',
    'https://jobs.lever.co/*',
    'https://*.ashbyhq.com/*',
    'https://*.myworkdayjobs.com/*',
    'https://sheets.googleapis.com/*',
    'https://www.googleapis.com/*',
  ],
  web_accessible_resources: [
    {
      resources: ['src/dashboard/index.html'],
      matches: ['<all_urls>'],
    },
  ],
  commands: {
    _execute_action: {
      suggested_key: {
        default: 'Ctrl+Shift+J',
        mac: 'Command+Shift+J',
      },
      description: 'Capture current job posting',
    },
  },
});
