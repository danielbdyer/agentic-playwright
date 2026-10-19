/**
 * A small OutSystems-Reactive-shaped application for end-to-end tests. It
 * reproduces the shapes the reality study found on real Reactive pages:
 * explicit landmarks, data-block containers, structural ids (b3-…),
 * placeholder-named inputs, a roleless handler-owning clickable named by its
 * own text, content rendered after hydration, rows with per-row links, a
 * feedback message, and a login guarded by a cookie.
 *
 * Routes live under /PolicyApp/ like an OutSystems module, so page objects
 * must navigate relative to the base URL (no leading slash).
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface FixtureApp {
  readonly baseURL: string;
  readonly close: () => Promise<void>;
  /** Change the markup the app serves, to simulate a release that drifts a locator. */
  readonly setVariant: (variant: 'v1' | 'v2-renamed-search') => void;
}

const POLICIES = [
  { number: 'POL-001', holder: 'Ada Lovelace', status: 'Active', premium: '1,200.00' },
  { number: 'POL-002', holder: 'Grace Hopper', status: 'Lapsed', premium: '840.50' },
  { number: 'POL-003', holder: 'Alan Turing', status: 'Active', premium: '2,310.75' },
];

const runtimeScripts = `
<script>window.OutSystems = { Internal: { ready: false } }; window.OSFramework = {};</script>
<script src="scripts/OutSystemsReactView.js"></script>
<script src="scripts/OutSystemsReactWidgets.js"></script>`;

const shell = (title: string, body: string, script: string): string => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${title}</title>${runtimeScripts}
<style>
  body { font-family: sans-serif; margin: 0; }
  header, nav, main { padding: 8px; }
  .hidden { display: none; }
  .osui-btn { cursor: pointer; }
  [data-block="Common.Filter"] div[onclick] { cursor: pointer; display: inline-block; padding: 2px 6px; border: 1px solid #999; }
</style>
</head>
<body>
<div id="reactContainer" data-container="">
</div>
<template id="page">${body}</template>
<script>
  // Hydration: the runtime mounts the screen after a short delay, like a Reactive app.
  setTimeout(() => {
    const root = document.getElementById('reactContainer');
    root.appendChild(document.getElementById('page').content.cloneNode(true));
    window.OutSystems.Internal.ready = true;
    ${script}
  }, 250);
</script>
</body>
</html>`;

const header = `
<header role="banner" data-block="Common.Header" class="osui-header">
  <span class="osui-app-title">Policy App</span>
  <nav role="navigation" data-block="Common.Menu" class="osui-menu">
    <a href="PolicySearch" id="b1-MenuPolicySearch">Policy Search</a>
    <a href="Claims" id="b1-MenuClaims">Claims</a>
    <a href="Dashboard" id="b1-MenuDashboard">Dashboard</a>
  </nav>
</header>`;

const loginPage = (): string =>
  shell(
    'Sign in',
    `<main role="main" data-block="Auth.Login" class="osui-login">
       <h1>Sign in</h1>
       <form id="b2-LoginForm" data-block="Auth.LoginForm">
         <label for="b2-Input_Username">Username</label>
         <input id="b2-Input_Username" type="text" autocomplete="username">
         <label for="b2-Input_Password">Password</label>
         <input id="b2-Input_Password" type="password" autocomplete="current-password">
         <button type="submit" class="osui-btn">Log in</button>
         <div role="alert" id="b2-LoginError" class="feedback-message hidden"></div>
       </form>
     </main>`,
    `document.getElementById('b2-LoginForm').addEventListener('submit', (e) => {
       e.preventDefault();
       const u = document.getElementById('b2-Input_Username').value;
       const p = document.getElementById('b2-Input_Password').value;
       if (u === 'qa.user' && p === 'correct-horse') {
         document.cookie = 'session=ok; path=/';
         setTimeout(() => { location.href = 'PolicySearch'; }, 100);
       } else {
         const err = document.getElementById('b2-LoginError');
         err.textContent = 'Invalid username or password';
         err.classList.remove('hidden');
       }
     });`,
  );

const policySearchPage = (variant: 'v1' | 'v2-renamed-search'): string =>
  shell(
    'Policy Search',
    `${header}
     <main role="main" data-block="Policy.PolicySearch" class="osui-main">
       <h1>Policy Search</h1>
       <div role="search" data-block="Policy.SearchBlock" class="osui-search">
         <input id="b3-Input_Search" type="text" placeholder="${variant === 'v1' ? 'Search Policy' : 'Find a policy'}" class="osui-input">
         <button id="b3-SearchButton" type="button" class="osui-btn">Search</button>
         <span data-block="Common.Filter"><div onclick="window.__filterOpen = !window.__filterOpen; document.getElementById('b3-FilterPanel').classList.toggle('hidden')">Filter</div></span>
         <div id="b3-FilterPanel" class="hidden"><label><input type="checkbox" id="b3-ActiveOnly"> Active only</label></div>
       </div>
       <div role="status" id="b3-Feedback" class="feedback-message"></div>
       <table id="b3-Results" class="osui-table hidden" data-block="Policy.ResultsTable">
         <thead><tr><th>Policy</th><th>Holder</th><th>Status</th><th>Premium</th><th>Actions</th></tr></thead>
         <tbody id="b3-ResultsBody"></tbody>
       </table>
     </main>`,
    `const policies = ${JSON.stringify(POLICIES)};
     const run = () => {
       const q = document.getElementById('b3-Input_Search').value.trim().toUpperCase();
       const activeOnly = document.getElementById('b3-ActiveOnly').checked;
       const feedback = document.getElementById('b3-Feedback');
       feedback.textContent = 'Searching…';
       setTimeout(() => {
         const rows = policies.filter((p) => p.number.includes(q) && (!activeOnly || p.status === 'Active'));
         const body = document.getElementById('b3-ResultsBody');
         body.innerHTML = rows.map((p) => '<tr><td>' + p.number + '</td><td>' + p.holder + '</td><td>' + p.status + '</td><td>' + p.premium + '</td><td><a href="PolicyDetail?id=' + p.number + '">Edit</a></td></tr>').join('');
         document.getElementById('b3-Results').classList.toggle('hidden', rows.length === 0);
         feedback.textContent = rows.length === 1 ? '1 policy found' : rows.length + ' policies found';
       }, 300);
     };
     document.getElementById('b3-SearchButton').addEventListener('click', run);
     document.getElementById('b3-Input_Search').addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });`,
  );

const claimsPage = (): string =>
  shell(
    'Claims',
    `${header}
     <main role="main" data-block="Claims.ClaimsList">
       <h1>Claims</h1>
       <label for="b4-Status">Claim status</label>
       <select id="b4-Status"><option>Open</option><option>Closed</option></select>
       <p id="b4-Count">3 open claims</p>
     </main>`,
    `document.getElementById('b4-Status').addEventListener('change', (e) => {
       document.getElementById('b4-Count').textContent = e.target.value === 'Open' ? '3 open claims' : '7 closed claims';
     });`,
  );

const detailPage = (id: string): string =>
  shell(
    `Policy ${id}`,
    `${header}
     <main role="main" data-block="Policy.PolicyDetail">
       <h1>Policy ${id.replace(/[^A-Z0-9-]/gi, '')}</h1>
       <a href="PolicySearch">Back to search</a>
     </main>`,
    '',
  );

export const startFixtureApp = async (): Promise<FixtureApp> => {
  let variant: 'v1' | 'v2-renamed-search' = 'v1';
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const loggedIn = /(?:^|;\s*)session=ok/.test(req.headers.cookie ?? '');
    const send = (status: number, body: string, type = 'text/html; charset=utf-8'): void => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
    };
    const route = url.pathname.replace(/^\/PolicyApp\/?/, '');
    if (!url.pathname.startsWith('/PolicyApp')) return send(404, 'not found', 'text/plain');
    if (route.startsWith('scripts/')) return send(200, '/* runtime stub */', 'application/javascript');
    if (route === '' || route === 'Login') return send(200, loginPage());
    if (!loggedIn) {
      res.writeHead(302, { location: '/PolicyApp/Login' }).end();
      return undefined;
    }
    if (route === 'PolicySearch') return send(200, policySearchPage(variant));
    if (route === 'Claims') return send(200, claimsPage());
    if (route === 'PolicyDetail') return send(200, detailPage(url.searchParams.get('id') ?? ''));
    if (route === 'Dashboard') return send(200, shell('Dashboard', `${header}<main role="main"><h1>Dashboard</h1></main>`, ''));
    return send(404, 'not found', 'text/plain');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseURL: `http://127.0.0.1:${port}/PolicyApp/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
    setVariant: (next) => {
      variant = next;
    },
  };
};
