"""Envio dos alertas pelo Telegram (Fase 6). Só usa a biblioteca padrão do Python.

Corre de hora a hora (GitHub Actions, .github/workflows/alertas.yml). Só envia quando chega a
hora escolhida nas Definições (por defeito 08:30 de Lisboa) e só uma vez por dia: junta numa
mensagem os alertas que o motor guardou durante a noite e marca-os como enviados.

    python -m radar.telegram            # envio diário (só à hora certa)
    python -m radar.telegram --agora    # envia já o que estiver por enviar
    python -m radar.telegram --teste    # mensagem de teste (não marca nada como enviado)
    python -m radar.telegram --falha URL  # guarda o alerta "a atualização noturna falhou"

Segredos (GitHub Secrets): SUPABASE_CHAVE_MOTOR, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID.
Os registos do GitHub são públicos: aqui só se escrevem contagens — nunca o token, o chat id,
os tickers nem os valores.
"""
from __future__ import annotations

import argparse
import copy
import datetime as dt
import html
import json
import os
import sys
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

from .parametros import PARAMETROS_PADRAO, _fundir
from .supabase_config import SUPABASE_CHAVE_PUBLICA, SUPABASE_URL, URL_APP

LISBOA = ZoneInfo("Europe/Lisbon")
LIMITE_MENSAGEM = 3800  # o Telegram aceita até 4096 caracteres por mensagem

EMOJI = {
    "falha": "⚠️", "vespera_ex": "⏳", "nova_ex": "📅", "dividendo_corte": "📉", "atrasado": "⏰",
    "dividendo_aumento": "📈", "abaixo_justo": "💚", "yield_alto": "🔥", "teste": "✅",
}
ORDEM = list(EMOJI)  # ordem dentro da mensagem (o mais urgente primeiro)


def _escrever(msg: str) -> None:
    print(msg, flush=True)


# ——— Supabase ———

def rpc(nome: str, corpo: dict, abrir=urllib.request.urlopen):
    pedido = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/rpc/{nome}", data=json.dumps(corpo).encode(), method="POST",
        headers={"apikey": SUPABASE_CHAVE_PUBLICA, "Content-Type": "application/json"})
    try:
        with abrir(pedido, timeout=30) as r:
            return json.loads(r.read().decode() or "null")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{nome}: HTTP {e.code}") from None  # nunca a chave nem o corpo


def escolhas(alteracoes) -> dict:
    e = copy.deepcopy(PARAMETROS_PADRAO["alertas"])
    if isinstance(alteracoes, dict):
        _fundir(e, alteracoes)
    return e


# ——— Quando enviar ———

def hora_envio(texto) -> dt.time:
    try:
        h, m = str(texto).strip().split(":")
        return dt.time(int(h), int(m))
    except (ValueError, TypeError):
        return dt.time(8, 30)


JANELA = dt.timedelta(hours=3)  # se o GitHub saltar uma execução, ainda envia na seguinte


def deve_enviar(agora: dt.datetime, hora: dt.time, ultimo_envio: str | None) -> bool:
    """Estamos entre a hora escolhida e 3 h depois (em Lisboa) e ainda não se enviou nada hoje.

    Fora dessa janela não se envia: alertas que apareçam durante o dia esperam pela hora do
    dia seguinte (uma só mensagem por dia, sempre à mesma hora).
    """
    agora = agora.astimezone(LISBOA)
    inicio = dt.datetime.combine(agora.date(), hora, tzinfo=LISBOA)
    if not (inicio <= agora < inicio + JANELA):
        return False
    if ultimo_envio:
        ultimo = dt.datetime.fromisoformat(str(ultimo_envio).replace("Z", "+00:00")).astimezone(LISBOA)
        if ultimo.date() >= agora.date():
            return False
    return True


# ——— Mensagem ———

def mensagens(alertas: list[dict], agora: dt.datetime) -> list[str]:
    """Texto (HTML do Telegram) dividido em mensagens com menos de 4096 caracteres."""
    ordenados = sorted(alertas, key=lambda a: (ORDEM.index(a["tipo"]) if a["tipo"] in ORDEM else 99, a.get("criado_em") or ""))
    n = len(ordenados)
    dia = agora.astimezone(LISBOA).strftime("%d/%m")
    cabecalho = f"🔔 <b>Radar de Dividendos</b> · {dia} · {n} alerta{'s' if n != 1 else ''}\n"
    rodape = f'\n<a href="{URL_APP}#/alertas">Ver todos na app</a>'
    blocos = []
    for a in ordenados:
        b = f"{EMOJI.get(a['tipo'], '•')} <b>{html.escape(a['titulo'])}</b>\n{html.escape(a.get('texto') or '')}"
        if a.get("ticker"):
            b += f'\n<a href="{URL_APP}#/acao/{html.escape(a["ticker"])}">Abrir na app</a>'
        blocos.append(b[:LIMITE_MENSAGEM - 200])
    out, atual = [], cabecalho
    for b in blocos:
        if len(atual) + len(b) + 2 > LIMITE_MENSAGEM:
            out.append(atual)
            atual = "🔔 <b>Radar de Dividendos</b> (continuação)\n"
        atual += "\n" + b + "\n"
    out.append(atual + rodape)
    return out


def enviar_telegram(token: str, chat_id: str, texto: str, abrir=urllib.request.urlopen) -> None:
    corpo = {"chat_id": chat_id, "text": texto, "parse_mode": "HTML", "disable_web_page_preview": True}
    pedido = urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", method="POST",
                                    data=json.dumps(corpo).encode(), headers={"Content-Type": "application/json"})
    try:
        with abrir(pedido, timeout=30) as r:
            if not json.loads(r.read().decode()).get("ok"):
                raise RuntimeError("Telegram: resposta sem ok")
    except urllib.error.HTTPError as e:
        # a descrição do Telegram (ex.: "chat not found") não tem segredos; o endereço tem o token
        try:
            descricao = json.loads(e.read().decode()).get("description", "")
        except Exception:  # noqa: BLE001
            descricao = ""
        raise RuntimeError(f"Telegram: HTTP {e.code} {descricao}".strip()) from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"Telegram: sem ligação ({type(e.reason).__name__})") from None


# ——— Modos ———

def _segredos(precisa_telegram: bool = True) -> tuple[str, str, str]:
    chave = os.environ.get("SUPABASE_CHAVE_MOTOR", "").strip()
    token = os.environ.get("TELEGRAM_TOKEN", "").strip()
    chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    falta = [n for n, v in (("SUPABASE_CHAVE_MOTOR", chave), ("TELEGRAM_TOKEN", token if precisa_telegram else "x"),
                            ("TELEGRAM_CHAT_ID", chat if precisa_telegram else "x")) if not v]
    if falta:
        raise SystemExit(f"Faltam os segredos: {', '.join(falta)}")
    return chave, token, chat


def diario(agora: dt.datetime | None = None, forcar: bool = False, abrir=urllib.request.urlopen) -> int:
    """Envio diário. Devolve quantos alertas foram enviados."""
    chave, token, chat = _segredos()
    agora = agora or dt.datetime.now(LISBOA)
    ctx = rpc("alertas_motor", {"chave": chave}, abrir)
    e = escolhas(ctx.get("alertas"))
    if not e.get("telegram", True):
        _escrever("Envio pelo Telegram desligado nas Definições.")
        return 0
    if not forcar and not deve_enviar(agora, hora_envio(e.get("hora_envio")), ctx.get("ultimo_envio")):
        _escrever("Ainda não é a hora de envio (ou já se enviou hoje).")
        return 0
    pendentes = rpc("alertas_por_enviar", {"chave": chave}, abrir) or []
    if not pendentes:
        _escrever("Sem alertas novos.")
        return 0
    for m in mensagens(pendentes, agora):
        enviar_telegram(token, chat, m, abrir)
    rpc("marcar_enviados", {"chave": chave, "chaves": [p["id"] for p in pendentes]}, abrir)
    _escrever(f"Enviados {len(pendentes)} alertas.")
    return len(pendentes)


def teste(agora: dt.datetime | None = None, abrir=urllib.request.urlopen) -> None:
    """Mensagem de teste: confirma os segredos, as funções do Supabase e o bot. Não marca nada."""
    chave, token, chat = _segredos()
    agora = agora or dt.datetime.now(LISBOA)
    ctx = rpc("alertas_motor", {"chave": chave}, abrir)
    e = escolhas(ctx.get("alertas"))
    pendentes = rpc("alertas_por_enviar", {"chave": chave}, abrir) or []
    n_cart, n_fav = len(ctx.get("carteira") or {}), len(ctx.get("favoritos") or [])
    texto = (
        "✅ <b>Radar de Dividendos — mensagem de teste</b>\n\n"
        "O bot está ligado e consegue ler a tua conta.\n"
        f"Acompanho <b>{n_cart}</b> ações da carteira e <b>{n_fav}</b> favoritos.\n"
        f"Os alertas chegam todos os dias às <b>{html.escape(str(e.get('hora_envio')))}</b> (hora de Lisboa), "
        "só quando houver novidades.\n"
        f"Alertas à espera de envio: <b>{len(pendentes)}</b>.\n\n"
        f'<a href="{URL_APP}#/definicoes#alertas">Mudar as escolhas nas Definições</a>'
    )
    enviar_telegram(token, chat, texto, abrir)
    _escrever("Mensagem de teste enviada.")


def falha(url_execucao: str = "", hoje: dt.date | None = None, abrir=urllib.request.urlopen) -> None:
    """Guarda o alerta "a atualização noturna falhou" (vai na próxima mensagem diária)."""
    chave, _, _ = _segredos(precisa_telegram=False)
    ctx = rpc("alertas_motor", {"chave": chave}, abrir)
    if not escolhas(ctx.get("alertas")).get("falha_atualizacao", True):
        _escrever("Alerta de falha desligado nas Definições.")
        return
    hoje = hoje or dt.datetime.now(LISBOA).date()
    item = {"chave": f"falha|{hoje.isoformat()}", "tipo": "falha", "ticker": None,
            "titulo": "A atualização noturna falhou",
            "texto": "Os dados da app podem estar desatualizados." + (f" Detalhes: {url_execucao}" if url_execucao else "")}
    n = rpc("registar_alertas", {"chave": chave, "itens": [item]}, abrir)
    _escrever(f"Alerta de falha guardado ({n} novo).")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Envia os alertas do Radar de Dividendos pelo Telegram.")
    g = ap.add_mutually_exclusive_group()
    g.add_argument("--teste", action="store_true", help="envia uma mensagem de teste")
    g.add_argument("--agora", action="store_true", help="envia já o que estiver por enviar")
    g.add_argument("--falha", metavar="URL", nargs="?", const="", help="guarda o alerta de falha da atualização")
    a = ap.parse_args(argv)
    try:
        if a.teste:
            teste()
        elif a.falha is not None:
            falha(a.falha)
        else:
            diario(forcar=a.agora)
    except RuntimeError as e:
        _escrever(f"Erro: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
