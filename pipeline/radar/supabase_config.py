"""Configuração pública lida do config.json da raiz do repositório (o mesmo que a app usa).

Só valores públicos: endereço do site e do Supabase e a chave PUBLICÁVEL. Nunca pôr aqui a
chave secreta do Supabase nem a "chave do motor" (essa vem do segredo SUPABASE_CHAVE_MOTOR).
"""
import json
from pathlib import Path

_CONFIG = json.loads((Path(__file__).resolve().parents[2] / "config.json").read_text(encoding="utf-8"))

SUPABASE_URL: str = _CONFIG["supabase_url"]
SUPABASE_CHAVE_PUBLICA: str = _CONFIG["supabase_chave_publica"]
URL_APP: str = _CONFIG["site"]
REPOSITORIO: str = _CONFIG["repositorio"]
