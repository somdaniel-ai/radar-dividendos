"""Cálculos do radar (secção 6 das instruções).

Cada ficheiro trata de um tema e não depende da internet, para poder ser testado
automaticamente com `pytest`.

Formato dos dados usados em todos os cálculos:
- dividendos: `pandas.Series` com índice de datas (data ex-dividendo, sem fuso horário)
  e o valor por ação na moeda do instrumento;
- preços: `pandas.DataFrame` com índice de datas e colunas `high`, `low`, `close`, `adjclose`.
"""
