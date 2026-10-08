#!/usr/bin/env bash
# PAROU.PT — publica as regras de segurança do Firestore e autoriza os domínios do login.
# Correr na Cloud Shell da consola da Firebase (já tem sessão iniciada com a conta do projeto):
#   curl -fsSL https://raw.githubusercontent.com/solobxy/parou/main/scripts/publicar-firebase.sh | bash
set -euo pipefail
export P=gen-lang-client-0120276978
export DB=ai-studio-parouptocorrncia-4052e7e7-7082-4c98-a038-4175cebb0330
curl -fsSL "https://raw.githubusercontent.com/solobxy/parou/main/firestore.rules?$(date +%s)" -o /tmp/parou.rules
export TOKEN="$(gcloud auth print-access-token)"
python3 - <<'PY'
import json, os, urllib.request, urllib.error

P, DB, T = os.environ['P'], os.environ['DB'], os.environ['TOKEN']

def pedido(metodo, url, corpo=None):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    req = urllib.request.Request(url, data=dados, method=metodo, headers={
        'Authorization': 'Bearer ' + T,
        'Content-Type': 'application/json',
        'X-Goog-User-Project': P,
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b'{}')
        except Exception:
            return e.code, {}

print()
# 1. Regras do Firestore (base de dados da PAROU)
regras = open('/tmp/parou.rules', encoding='utf-8').read()
s, rs = pedido('POST', f'https://firebaserules.googleapis.com/v1/projects/{P}/rulesets',
               {'source': {'files': [{'name': 'firestore.rules', 'content': regras}]}})
if s != 200:
    print('ERRO: as regras não foram aceites:', s, json.dumps(rs, ensure_ascii=False)[:1200])
    raise SystemExit(1)
nome = f'projects/{P}/releases/cloud.firestore/{DB}'
s, r = pedido('PATCH', f'https://firebaserules.googleapis.com/v1/{nome}',
              {'release': {'name': nome, 'rulesetName': rs['name']}})
if s == 404:
    s, r = pedido('POST', f'https://firebaserules.googleapis.com/v1/projects/{P}/releases',
                  {'name': nome, 'rulesetName': rs['name']})
if s == 200:
    print('1) Regras de segurança publicadas: OK')
else:
    print('1) ERRO ao publicar as regras:', s, json.dumps(r, ensure_ascii=False)[:1200])

# 2. Domínios autorizados para o login (Google e email)
s, cfg = pedido('GET', f'https://identitytoolkit.googleapis.com/admin/v2/projects/{P}/config')
if s == 200:
    atuais = cfg.get('authorizedDomains', [])
    novos = [d for d in ['parou.pt', 'www.parou.pt', '2-31-13-85.sslip.io'] if d not in atuais]
    if novos:
        s2, r2 = pedido('PATCH', f'https://identitytoolkit.googleapis.com/admin/v2/projects/{P}/config?updateMask=authorizedDomains',
                        {'authorizedDomains': atuais + novos})
        print('2) Domínios autorizados: OK (' + ', '.join(novos) + ')' if s2 == 200 else f'2) ERRO nos domínios: {s2} {json.dumps(r2, ensure_ascii=False)[:800]}')
    else:
        print('2) Domínios autorizados: já estavam todos')
else:
    print('2) Não consegui ler os domínios autorizados:', s, json.dumps(cfg, ensure_ascii=False)[:800])
print()
PY
