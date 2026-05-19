# NutriPlan

NutriPlan je interaktivní webová aplikace pro výpočet denních maker a generování jídelníčku na míru pomocí AI. Uživatel zadá základní údaje, cíl, aktivitu a stravovací preference, aplikace spočítá kalorický cíl a následně vygeneruje recepty včetně ingrediencí, postupu a nákupního seznamu.

## Splnění zadání

- Vlastní uživatelské rozhraní: responzivní UI s kalkulačkou, editací maker, výběrem preferencí, historií, nákupním seznamem, tmavým režimem a modály.
- Strukturovaný výstup: Gemini vrací validní JSON pro jídelníčky, výměnu jídel i odhad maker z fotky.
- Více LLM volání / kontext: aplikace používá jiné prompty pro vygenerování celého jídelníčku a pro výměnu konkrétního jídla v existujícím plánu.
- Další datový zdroj a paměť: profil, historie jídelníčků, generační limity a premium stav jsou ukládané v Supabase.
- Multimodalita: uživatel může nahrát fotku jídla a AI z ní odhadne porci, kalorie a makra.

## Demo průchod

1. Otevři aplikaci a bez přihlášení vyplň věk, výšku a váhu.
2. Klikni na **Spočítat makra**.
3. Doplň preference jídla, styl stravování a počet jídel.
4. Klikni na **Vygenerovat jídelníček**.
5. Klikni na recept pro detail, případně použij **Vyměnit jídlo**.
6. V části **Odhad maker z fotky jídla** nahraj obrázek jídla a spusť multimodální analýzu.

## Technologie

- Frontend: HTML, CSS, vanilla JavaScript moduly
- AI: Gemini přes Vercel serverless proxy
- Multimodalita: Gemini Vision přes `/api/analyze-food-photo`
- Databáze a autentizace: Supabase
- Platby / premium: Stripe
- Deployment: Vercel
