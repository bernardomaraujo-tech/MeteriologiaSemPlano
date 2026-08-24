# SEM PLANO — Meteo

PWA mobile-first para avaliar condições de ciclismo e calcular pressão de pneus.

## Estrutura

- **Atual** — vento, rajadas e direção visual em destaque; precipitação, temperatura, humidade, UV, evolução das próximas 6 horas, roupa técnica sugerida e qualidade da condição.
- **Previsão** — evolução hora a hora das próximas 48 horas, resumo de 7 dias e análise de rotas GPX com meteorologia prevista ao longo do percurso.
- **Ciclismo** — notícias filtráveis de Estrada, Mountain Bike, Ciclocross e Gravel; provas/classificações, equipas/ciclistas, transferências, curiosidades e calendário dos principais eventos.
- **Pressão Pneus** — calculadora completa, acesso rápido aos 3 setups mais recentes, gestão de setups guardados e histórico local de resultados.

## Dados e armazenamento

- Meteorologia e geocodificação: [Open-Meteo](https://open-meteo.com/).
- Modelo preferencial: **KNMI Seamless**, combinando HARMONIE-AROME na sua área de cobertura com ECMWF; se os dados estiverem indisponíveis ou incompletos, a aplicação utiliza automaticamente o **Open-Meteo Best Match**.
- Mapa discreto do cartão de vento: [OpenStreetMap](https://www.openstreetmap.org/copyright), centrado automaticamente na localização selecionada.
- Localização selecionada, última posição autorizada, setups e histórico: guardados apenas no `localStorage` do dispositivo. A última posição é reutilizada nas visitas seguintes; o GPS só volta a ser consultado quando o utilizador seleciona explicitamente **Localização atual**.
- Ficheiros GPX: processados localmente no dispositivo e não guardados pela aplicação.
- Notícias: agregação horária do Google News, limitada a uma seleção editorial de publicações especializadas por modalidade, numa branch de dados do próprio repositório; RSS2JSON funciona apenas como fallback. A app mantém cache local de 30 minutos e reutiliza as últimas notícias durante 24 horas em caso de indisponibilidade temporária.
- Calendários e classificações: seleção editorial de eventos com ligações para a UCI e para os sites oficiais de cada competição.
- Atualização automática: a cada 5 minutos.

## Executar localmente

Não existem dependências de build. Basta servir a raiz por HTTP:

```bash
python3 -m http.server 4173
```

Depois abrir `http://localhost:4173`.

## PWA

O `service worker` mantém a interface disponível em cache. Depois de uma publicação, pode ser necessário fazer uma atualização completa ou reabrir a PWA para carregar a nova versão.
