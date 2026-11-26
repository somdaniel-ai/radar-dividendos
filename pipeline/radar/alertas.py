"""Alertas das ações da carteira e dos favoritos (Fase 6).

Todas as noites, depois de calcular o radar:
  1. pede ao Supabase a lista da carteira (ticker + quantidade), dos favoritos e as escolhas de
     alertas (`alertas_motor`, com a "chave do motor" — acesso mínimo, ver supabase/migracoes/0004);
  2. compara os dados novos com os da noite anterior e prepara os alertas;
  3. guarda-os na conta (`registar_alertas`). Cada alerta tem uma "chave" (impressão digital): o mesmo
     alerta nunca é guardado nem enviado duas vezes.
O envio pelo Telegram é feito à parte, à hora escolhida (radar/telegram.py).

O repositório é público e os registos do GitHub Actions também: aqui só se escrevem CONTAGENS,
nunca os tickers da carteira/favoritos nem valores.
"""
from __future__ import annotations

import copy
import datetime as dt
import logging
import os

import requests

from .parametros import PARAMETROS_PADRAO, _fundir
from .supabase_config import SUPABASE_CHAVE_PUBLICA, SUPABASE_URL

log = logging.getLogger(__name__)

TIPOS = ("abaixo_justo", "dividendo", "atrasado", "yield_alto", "nova_ex", "vespera_ex")


# ——— Supabase ———

def _rpc(nome: str, corpo: dict, sessao=requests):
    r = sessao.post(f"{SUPABASE_URL}/rest/v1/rpc/{nome}", json=corpo, timeout=30,
                    headers={"apikey": SUPABASE_CHAVE_PUBLICA, "Content-Type": "application/json"})
    if r.status_code != 200:
        raise RuntimeError(f"{nome}: HTTP {r.status_code}")  # nunca a chave nem o corpo
    return r.json()


def chave_motor() -> str:
    return os.environ.get("SUPABASE_CHAVE_MOTOR", "").strip()


def ler_contexto(chave: str | None = None, sessao=requests) -> dict | None:
    """{"carteira": {ticker: qtd}, "favoritos": [..], "escolhas": {...}, "ultimo_envio": str|None} ou None."""
    chave = chave if chave is not None else chave_motor()
    if not chave:
        log.info("Sem SUPABASE_CHAVE_MOTOR: sem alertas")
        return None
    try:
        d = _rpc("alertas_motor", {"chave": chave}, sessao)
    except Exception as e:  # noqa: BLE001 — sem alertas o motor continua
        log.warning("Não foi possível ler a lista dos alertas (%s)", e if isinstance(e, RuntimeError) else type(e).__name__)
        return None
    return {
        "carteira": {str(t).upper(): float(q) for t, q in (d.get("carteira") or {}).items()},
        "favoritos": [str(t).upper() for t in d.get("favoritos") or []],
        "escolhas": escolhas(d.get("alertas") or {}),
        "ultimo_envio": d.get("ultimo_envio"),
    }


def escolhas(alteracoes: dict) -> dict:
    """Escolhas de alertas do utilizador por cima das de defeito."""
    e = copy.deepcopy(PARAMETROS_PADRAO["alertas"])
    if isinstance(alteracoes, dict):
        _fundir(e, alteracoes)
    return e


def registar(itens: list[dict], chave: str | None = None, sessao=requests) -> int | None:
    """Guarda os alertas na conta; devolve quantos eram novos (None se falhou)."""
    chave = chave if chave is not None else chave_motor()
    if not chave or not itens:
        return 0 if chave else None
    try:
        n = 0
        for i in range(0, len(itens), 300):
            n += int(_rpc("registar_alertas", {"chave": chave, "itens": itens[i:i + 300]}, sessao))
        return n
    except Exception as e:  # noqa: BLE001
        log.warning("Não foi possível guardar os alertas (%s)", e if isinstance(e, RuntimeError) else type(e).__name__)
        return None


# ——— Formatação (pt-PT) ———

def numero(x: float, casas: int = 2) -> str:
    s = f"{abs(x):,.{casas}f}".replace(",", " ").replace(".", ",").replace(" ", ".")
    return ("-" if x < 0 else "") + s


def valor(x: float | None, moeda: str | None, cambio: float | None, em_euros: bool, casas: int = 2) -> str:
    """'0,15 € (0,17 USD)' — ou só a moeda original, se o utilizador não quiser valores em €."""
    if x is None:
        return "—"
    m = (moeda or "").upper()
    original = f"{numero(x, casas)} {m}".strip()
    if m == "EUR":
        return f"{numero(x, casas)} €"
    if not em_euros or not cambio:
        return original
    return f"{numero(x * cambio, casas)} € ({original})"


def pct(x: float | None, casas: int = 1) -> str:
    return "—" if x is None else f"{numero(x * 100, casas)}%"


def data_curta(iso: str) -> str:
    a, m, d = iso[:10].split("-")
    return f"{d}/{m}"


def dia_util_anterior(d: dt.date) -> dt.date:
    """Dia útil anterior (só fins de semana; feriados não contam)."""
    d -= dt.timedelta(days=1)
    while d.weekday() >= 5:
        d -= dt.timedelta(days=1)
    return d


# ——— Cálculo ———

def _ativo(escolhas_: dict, tipo: str, na_carteira: bool) -> bool:
    e = escolhas_.get(tipo) or {}
    return bool(e.get("carteira" if na_carteira else "favoritos"))


def _semana(hoje: dt.date) -> str:
    a, s, _ = hoje.isocalendar()
    return f"{a}-S{s:02d}"


def calcular(novos: dict[str, dict], antigos: dict[str, dict], ctx: dict, hoje: dt.date,
             tolerancia_igual: float = 0.01) -> list[dict]:
    """Alertas [{chave, tipo, ticker, titulo, texto}] para as ações da carteira e dos favoritos.

    `novos`/`antigos` = resumos do radar desta noite e da anterior, por ticker.
    """
    e = ctx["escolhas"]
    eur = bool(e.get("valores_em_euros", True))
    lim = float(e.get("yield_limite") or 0.10)
    carteira = ctx["carteira"]
    interesse = list(dict.fromkeys([*carteira, *ctx["favoritos"]]))
    semana = _semana(hoje)
    out: list[dict] = []

    for t in interesse:
        a = novos.get(t)
        if not a:
            continue
        v = antigos.get(t)
        cart = t in carteira
        qtd = carteira.get(t, 0.0)
        m, fx = a.get("moeda"), a.get("cambio_eur")
        div = a.get("dividendo") or {}
        pag = a.get("pagamento") or {}
        imposto = (a.get("imposto") or {}).get("taxa") or 0.0
        y = (a.get("yield") or {}).get("liquido")
        nome = a.get("nome") or t

        def recebe() -> str:
            """'Com as tuas 37,04 ações: ≈ 4,40 € líquidos.' (só na carteira e com valores em €)."""
            if not cart or not eur or div.get("ultimo") is None or not fx:
                return ""
            liq = div["ultimo"] * fx * qtd * (1 - imposto)
            return f" Com as tuas {numero(qtd, 4).rstrip('0').rstrip(',')} ações: ≈ {numero(liq)} € líquidos."

        def novo(tipo: str, chave: str, titulo: str, texto: str):
            out.append({"chave": chave, "tipo": tipo, "ticker": t, "titulo": f"{t} — {titulo}", "texto": f"{nome}. {texto}".strip()})

        # 💚 abaixo do preço justo (o que a pontuação usa: histórico ou yield alvo)
        if _ativo(e, "abaixo_justo", cart) and v:
            hist = a.get("preco_justo_pontuacao") == "historico"
            campo = "abaixo_preco_justo_historico" if hist else "abaixo_preco_justo"
            if a.get(campo) and not v.get(campo):
                justo = a.get("preco_justo_historico" if hist else "preco_justo")
                novo("abaixo_justo", f"justo|{t}|{semana}", "abaixo do preço justo",
                     f"Preço {valor(a.get('preco'), m, fx, eur)}, abaixo do preço justo "
                     f"{'histórico ' if hist else ''}{valor(justo, m, fx, eur)}. Yield líquido {pct(y)}.")

        # 📈📉 aumento ou corte (um pagamento novo diferente do anterior)
        if _ativo(e, "dividendo", cart) and v:
            vd = v.get("dividendo") or {}
            if div.get("ultimo_data") and vd.get("ultimo_data") and div["ultimo_data"] > vd["ultimo_data"] \
                    and div.get("ultimo") and vd.get("ultimo"):
                var = div["ultimo"] / vd["ultimo"] - 1
                if abs(var) > tolerancia_igual:
                    tipo = "dividendo_aumento" if var > 0 else "dividendo_corte"
                    novo(tipo, f"div|{t}|{div['ultimo_data']}", f"{'aumento' if var > 0 else 'corte'} do dividendo ({'+' if var > 0 else ''}{pct(var)})",
                         f"Último dividendo {valor(div['ultimo'], m, fx, eur, 4)} por ação (antes {valor(vd['ultimo'], m, fx, eur, 4)}), "
                         f"data ex {data_curta(div['ultimo_data'])}.{recebe()}")

        # ⏰ pagamento atrasado / possivelmente suspenso
        if _ativo(e, "atrasado", cart) and v and pag.get("atrasado") and not (v.get("pagamento") or {}).get("atrasado"):
            esperado = pag.get("esperado")
            novo("atrasado", f"atraso|{t}|{esperado or hoje.isoformat()}", "pagamento atrasado",
                 f"O dividendo era esperado por volta de {data_curta(esperado) if esperado else '—'} e ainda não apareceu"
                 " (pode estar atrasado ou suspenso).")

        # 🔥 yield acima de X% (ao passar o limite)
        if _ativo(e, "yield_alto", cart) and v and y is not None and y > lim:
            antes = (v.get("yield") or {}).get("liquido")
            if antes is not None and antes <= lim:
                arm = a.get("armadilhas") or []
                aviso = (" ⚠️ Atenção: " + "; ".join(x.get("texto", "") for x in arm)) if arm else ""
                novo("yield_alto", f"yield|{t}|{semana}", f"yield líquido acima de {pct(lim, 0)} ({pct(y)})",
                     f"Preço {valor(a.get('preco'), m, fx, eur)}; dividendo anual {valor(div.get('anual'), m, fx, eur)}.{aviso}")

        # 📅 nova data ex-dividendo anunciada + 🔔 véspera (último dia para comprar)
        ex = pag.get("proxima_ex_anunciada")
        if ex and ex >= hoje.isoformat():
            dex = dt.date.fromisoformat(ex)
            ultimo = dia_util_anterior(dex)
            pg = pag.get("data_pagamento")
            pg_txt = f" Pagamento a {data_curta(pg)}." if pg and pg >= ex else ""
            por_acao = f" Dividendo ≈ {valor(div.get('ultimo'), m, fx, eur, 4)} por ação." if div.get("ultimo") else ""
            if _ativo(e, "nova_ex", cart):
                compra = "Já tens a ação: recebes se não venderes antes." if cart else \
                    f"Para receber, compra até {data_curta(ultimo.isoformat())}."
                novo("nova_ex", f"ex|{t}|{ex}", f"data ex-dividendo a {data_curta(ex)}",
                     f"{compra}{por_acao}{pg_txt}{recebe()}")
            if _ativo(e, "vespera_ex", cart) and ultimo == hoje:
                o_que = "Mantém a ação até amanhã para receber." if cart else "Hoje é o último dia para comprar e receber este dividendo."
                novo("vespera_ex", f"vespera|{t}|{ex}", f"data ex-dividendo {'amanhã' if (dex - hoje).days == 1 else 'no próximo dia útil'} ({data_curta(ex)})",
                     f"{o_que}{por_acao}{pg_txt}{recebe()}")
    return out


def interesse(ctx: dict | None) -> set[str]:
    """Tickers da carteira e dos favoritos (para irem à frente na atualização noturna)."""
    return set(ctx["carteira"]) | set(ctx["favoritos"]) if ctx else set()
