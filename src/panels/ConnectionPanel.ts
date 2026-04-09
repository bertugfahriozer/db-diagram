import * as vscode from 'vscode';
import type { DatabaseManager } from '../db/DatabaseManager';
import type { ConnectionsProvider } from '../providers/ConnectionsProvider';
import type { SnapshotManager } from '../managers/SnapshotManager';
import type { ConnectionConfig } from '../db/types';
import { DiagramPanel } from './DiagramPanel';

export class ConnectionPanel {
  private static panel: vscode.WebviewPanel | undefined;

  static show(ctx: vscode.ExtensionContext, db: DatabaseManager, tree: ConnectionsProvider, snaps: SnapshotManager, prefill?: Partial<ConnectionConfig>): void {
    if (ConnectionPanel.panel) { ConnectionPanel.panel.reveal(); return; }
    const saved: Partial<ConnectionConfig> = prefill ?? ctx.globalState.get('dbdiagram.lastConn') ?? {};
    const panel = vscode.window.createWebviewPanel('dbConnect', 'DB Diagram — Bağlan', vscode.ViewColumn.One, { enableScripts: true });
    ConnectionPanel.panel = panel;
    panel.webview.html = buildHtml(saved);

    panel.webview.onDidReceiveMessage(async msg => {
      if (msg.type !== 'connect') return;
      const { cfg, save, password } = msg;
      try {
        panel.webview.postMessage({ type: 'loading' });

        // Veritabanına bağlan
        await db.connect({ ...cfg, password });

        // Bağlantı başarılıysa kaydet
        if (save) {
          const id = cfg.id || Date.now().toString(36);
          await tree.save({ ...cfg, id }, password);
        }

        // Son bağlantı bilgilerini kaydet
        await ctx.globalState.update('dbdiagram.lastConn', { type: cfg.type, host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database });

        // Panel'i kapat ve diagram panelini aç
        panel.dispose();
        DiagramPanel.createOrShow(ctx, db, snaps, tree);
      } catch (e: unknown) {
        panel.webview.postMessage({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
    });

    panel.onDidDispose(() => { ConnectionPanel.panel = undefined; });
  }
}

function h(v: unknown): string { return String(v ?? '').replace(/"/g, '&quot;'); }

function buildHtml(saved: Partial<ConnectionConfig>): string {
  const type = saved.type ?? 'mysql';
  const port = saved.port ?? (type === 'postgresql' ? 5432 : 3306);
  return `<!DOCTYPE html><html lang="tr">
<head><meta charset="UTF-8"><title>Bağlan</title><style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0d0f18;--s:#171a26;--s2:#1e2130;--b:#2a2d45;--a:#6366f1;--a2:#818cf8;--r:#ef4444;--t:#e2e8f0;--t2:#94a3b8;--t3:#64748b;--R:8px}
body{background:var(--bg);color:var(--t);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:var(--s);border:1px solid var(--b);border-radius:16px;width:100%;max-width:480px;padding:32px;box-shadow:0 24px 64px #00000080}
.logo{display:flex;align-items:center;gap:12px;margin-bottom:28px}
.logo-i{width:46px;height:46px;background:linear-gradient(135deg,#4f46e5,#6366f1);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:22px}
h1{font-size:18px;font-weight:700}p{font-size:12px;color:var(--t3);margin-top:2px}
.tabs{display:flex;gap:6px;margin-bottom:20px;background:var(--s2);padding:4px;border-radius:10px}
.tab{flex:1;padding:8px;border:none;background:none;color:var(--t2);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;font-family:inherit;transition:all .15s}
.tab.on{background:var(--a);color:#fff}
.fg{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
.row{display:flex;gap:12px;margin-bottom:14px}.row .fg{flex:1;margin-bottom:0}.row .fg.sm{flex:0 0 110px}
label{font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:.06em}
input,select{background:var(--s2);border:1px solid var(--b);color:var(--t);border-radius:var(--R);padding:9px 12px;font-size:13px;font-family:inherit;width:100%;outline:none;transition:border-color .15s}
input:focus,select:focus{border-color:var(--a);box-shadow:0 0 0 3px #6366f115}
select option{background:var(--s2)}
.sep{border:none;border-top:1px solid var(--b);margin:16px 0}
.chk{display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;font-size:12px;color:var(--t2)}
.chk input{width:15px;height:15px;accent-color:var(--a);cursor:pointer}
.btn{width:100%;padding:12px;background:var(--a);color:#fff;border:none;border-radius:var(--R);font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;transition:all .15s}
.btn:hover{background:var(--a2);transform:translateY(-1px)}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}
.err{background:#ef444420;border:1px solid #ef444450;color:#fca5a5;padding:10px 14px;border-radius:var(--R);font-size:12px;margin-top:12px;display:none}
.spin{width:16px;height:16px;border:2px solid #ffffff40;border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.hint{font-size:11px;color:var(--t3);text-align:center;margin-top:14px}
</style></head>
<body>
<div class="card">
  <div class="logo"><div class="logo-i">⬡</div><div><h1>DB Diagram</h1><p>Visual Database Designer</p></div></div>
  <div class="tabs">
    <button class="tab ${type==='mysql'?'on':''}" onclick="setType('mysql')">🐬 MySQL</button>
    <button class="tab ${type==='postgresql'?'on':''}" onclick="setType('postgresql')">🐘 PostgreSQL</button>
  </div>
  <div class="row">
    <div class="fg"><label>Host</label><input id="host" value="${h(saved.host??'localhost')}"/></div>
    <div class="fg sm"><label>Port</label><input id="port" type="number" value="${h(port)}"/></div>
  </div>
  <div class="fg"><label>Veritabanı</label><input id="database" value="${h(saved.database??'')}"/></div>
  <hr class="sep"/>
  <div class="fg"><label>Kullanıcı</label><input id="user" value="${h(saved.user??'root')}"/></div>
  <div class="fg"><label>Şifre</label><input id="pw" type="password" autocomplete="new-password"/></div>
  <hr class="sep"/>
  <div class="fg"><label>Bağlantı Adı</label><input id="cname" placeholder="Üretim DB (isteğe bağlı)"/></div>
  <label class="chk"><input type="checkbox" id="save" checked/> Bağlantıyı kaydet</label>
  <button class="btn" id="btn" onclick="connect()"><span id="lbl">Bağlan</span></button>
  <div class="err" id="err"></div>
  <p class="hint">Şifre hiçbir zaman kaydedilmez (VS Code SecretStorage)</p>
</div>
<script>
const vscode = acquireVsCodeApi();
let dbType = '${type}';
function setType(t){
  dbType=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.remove('on'));
  event.target.classList.add('on');
  document.getElementById('port').value=t==='postgresql'?5432:3306;
}
window.addEventListener('message',e=>{
  const m=e.data;
  if(m.type==='loading'){setLoad(true);}
  else if(m.type==='error'){setLoad(false);showErr(m.message);}
});
function connect(){
  const host=document.getElementById('host').value.trim();
  const port=parseInt(document.getElementById('port').value)||(dbType==='postgresql'?5432:3306);
  const database=document.getElementById('database').value.trim();
  const user=document.getElementById('user').value.trim();
  const password=document.getElementById('pw').value;
  const name=document.getElementById('cname').value.trim()||database;
  const save=document.getElementById('save').checked;
  if(!host){showErr('Host zorunlu');return;}
  if(!database){showErr('Veritabanı adı zorunlu');return;}
  if(!user){showErr('Kullanıcı adı zorunlu');return;}
  hideErr();
  vscode.postMessage({type:'connect',password,save,cfg:{type:dbType,host,port,database,user,name,id:Date.now().toString(36)}});
}
function setLoad(on){const btn=document.getElementById('btn'),lbl=document.getElementById('lbl');btn.disabled=on;lbl.innerHTML=on?'<div class="spin"></div> Bağlanıyor…':'Bağlan';}
function showErr(m){const e=document.getElementById('err');e.textContent=m;e.style.display='block';}
function hideErr(){document.getElementById('err').style.display='none';}
document.addEventListener('keydown',e=>{if(e.key==='Enter')connect();});
</script></body></html>`;
}
