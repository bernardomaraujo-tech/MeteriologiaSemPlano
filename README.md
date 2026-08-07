# SEM PLANO — Meteo

PWA mobile-first para avaliar condições de ciclismo e calcular pressão de pneus.

## Estrutura

- **Atual** — vento, rajadas e direção visual em destaque; precipitação, temperatura, humidade, UV, roupa técnica sugerida e qualidade da condição.
- **Previsão** — evolução hora a hora das próximas 48 horas e resumo de 7 dias, com direção do vento em todos os períodos.
- **Pressão Pneus** — calculadora completa, setups guardados e histórico local de resultados.

## Dados e armazenamento

- Meteorologia e geocodificação: [Open-Meteo](https://open-meteo.com/).
- Mapa discreto do cartão de vento: [OpenStreetMap](https://www.openstreetmap.org/copyright), centrado automaticamente na localização selecionada.
- Localização, setups e histórico: guardados apenas no `localStorage` do dispositivo.
- Atualização automática: a cada 5 minutos.

## Executar localmente

Não existem dependências de build. Basta servir a raiz por HTTP:

```bash
python3 -m http.server 4173
```

Depois abrir `http://localhost:4173`.

## PWA

O `service worker` mantém a interface disponível em cache. Depois de uma publicação, pode ser necessário fazer uma atualização completa ou reabrir a PWA para carregar a nova versão.
