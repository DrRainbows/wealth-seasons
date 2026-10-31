# Wealth Seasons

A playable projection of one financial life. Wages, tax, housing, and markets run year by year. Two other lives run the same years beside yours. It is a game and a teaching instrument. It is not advice and it is not a forecast.

Market history in `data/historical.js` is published annual series (S&P 500, Treasuries, CPI, housing, farmland), 1928 through 2024. Tax is federal plus Alabama.

## Run

Open `index.html` in a browser. No build, no install, no account.

The player's manual is `manual.html`. The same text is in `MANUAL.md`.

Engine checks, with Node and no browser:

```
node test/headless.js
node test/strategies.js
```

## For an agent

Vanilla JS, one global named `GAME`, script tags in `index.html`. Do not convert it to modules. Modules break opening the file directly.

`js/engine.js` is the year loop. `js/tax.js` is the tax. `js/patterns.js` is the scoring. Do not put a real person's accounts, statements, or keys in this repo.
