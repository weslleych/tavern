# Plan: Multi-Language Support (i18n) with next-intl

## 1. Overview & Objective

Implement full internationalization (i18n) in Tavern using `next-intl` for Next.js App Router, enabling seamless language switching between English (`en`, default/existing), Brazilian Portuguese (`pt-BR`), and Spanish (`es`). The solution preserves clean table URLs (`/`, `/room/[code]`), grants per-player language autonomy in multiplayer sessions via cookies/headers, provides an accessible `<LanguageSwitcher />` component in the Hub and Tabletop, and maintains 100% backward compatibility with all existing test suites, saved rooms, and game state.

---

## 2. Workspace & Codebase Audit

- **Affected files / modules:**
  - `package.json`: Add `next-intl` dependency.
  - `next.config.ts`: Wrap configuration with `createNextIntlPlugin()`.
  - `src/i18n/request.ts`: Request-scoped locale resolution via `cookies()` (`NEXT_LOCALE`), `headers()` (`accept-language`), and fallback to `'en'`.
  - `messages/en.json`: Exhaustive English string dictionary organized by namespaces.
  - `messages/pt-BR.json`: Brazilian Portuguese translation dictionary with natural tabletop/RPG terminology.
  - `messages/es.json`: Spanish translation dictionary with natural tabletop/RPG terminology.
  - `src/components/ui/language-switcher.tsx`: Accessible language switcher component with cookie management and dynamic refresh.
  - `src/app/layout.tsx`: Async server layout loading messages and wrapping app in `<NextIntlClientProvider>` with dynamic `<html lang="...">`.
  - `src/app/page.tsx` & `src/app/room/[code]/page.tsx`: Pass-through pages benefiting from client translation context.
  - `src/app/not-found.tsx` & `src/app/error.tsx`: Localized fallback and error pages.
  - `src/components/hub.tsx`: Localized hero copy, feature steps, tab labels, form fields, recent tables, headers, and footer.
  - `src/components/tabletop.tsx`: Localized toolbars, overlays, GM coordination controls, scene manager, modal dialogs, and mobile HUD.
  - `src/components/canvas/map-canvas.tsx`: Localized HUD banners, movement paused alerts, and player selection cues.
  - `src/components/dice-sidebar.tsx`: Localized dice formulas, roll controls, attribute check chips, badges, and history log.
  - `src/components/character-creator.tsx`: Localized two-step onboarding (Archetype & Appearance), color options, and action buttons.
  - `src/components/class-manager.tsx`: Localized GM class catalog editor, attribute modifier labels, and validation hints.
  - `src/components/class-picker.tsx` & `src/components/class-summary.tsx`: Localized class cards, trait badges, and HP bonus previews.
  - `src/components/health-editor.tsx` & `src/components/health-status.tsx`: Localized health adjustment dialog, labels, and state indicators.
  - `src/lib/terrain.ts`: Translatable terrain tooltips and swatch labels.
  - `src/lib/classes.ts`: Localized default presets while retaining `defaultClasses` export for test compatibility.
  - `docs/roadmap.md`: Registration of Phase 9.
  - `tests/i18n.test.ts`: Unit tests verifying dictionary completeness, key parity across `en`, `es`, `pt-BR`, and fallback behavior.
  - `tests/e2e/i18n.spec.ts`: Playwright tests verifying language switcher behavior on Hub and Tabletop, cookie persistence, and DOM updates.

- **Dependencies & Tools:**
  - `next-intl` (^4.14.9 compatible with Next.js 16.3.8 and React 19.3.0).
  - Node.js >= 22.12.0, Next.js 16.3.8, React 19.3.0, TypeScript 5.9.3, Playwright 1.58.2.
  - Verification scripts: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`.

- **Current state & Assumptions:**
  - Existing URLs (`/`, `/room/[code]`, `/?join=[code]`) must not be broken or forced into mandatory URL prefixes (`/[locale]/`), avoiding disruption to room sharing or existing Playwright specs.
  - In a multiplayer room, players share game state (tokens, maps, dice results) over Socket.io, but client UI language is individual and local to each user's browser via cookie `NEXT_LOCALE`.
  - All 60 unit/integration tests and 23 browser specs currently pass. Existing assertions expecting default English strings must continue to pass seamlessly when `NEXT_LOCALE` defaults to `'en'`.

---

## 3. Implementation Phases

### Reconciled execution checklist (2026-10-04)

- Baseline: 60 unit/integration tests pass; the workspace already contains the planned Phase 9 roadmap entry. Preserve both existing documentation edits.
- Keep locale negotiation in a pure helper so cookie precedence, language quality weights, regional variants, unsupported languages, and English fallback can be tested without a Next.js request.
- Preserve canonical Portuguese `defaultClasses`, attribute IDs, saved catalogs, dice records, session credentials, and Socket.io contracts. Translate preset fields only when they still match their canonical defaults; custom names/descriptions/traits remain verbatim. Display attribute checks from their stable attribute IDs.
- Existing browser tests include Portuguese preset/attribute labels in the English UI. Update those display expectations to English when translating these labels, keeping their workflow and authority assertions.
- Also localize metadata, shared dialog controls, map-preview accessibility text, connection statuses, and known server/validation errors at the presentation boundary.
- Verify language switching preserves in-progress forms, canvas state, private sessions, and independent languages for two participants in one room, including mobile layouts.
- Final Git verification means only intended changes, with no whitespace errors; this task does not authorize commits or require an empty working tree.
- The expanded browser suite exceeds the shared API's 40 requests/minute allowance with the original automatic worker concurrency. Configure one Playwright worker and keep application rate limiting enabled.

### Phase 1: Environment Setup & Core i18n Configuration

- [x] **Step 1.1: Install `next-intl`**
  - **Details:** Install `next-intl` package compatible with Next.js 16 and React 19:
    ```bash
    npm install next-intl
    ```
  - **Verification:** Check `package.json` contains `next-intl` under `dependencies` and `npm run typecheck` succeeds.

- [x] **Step 1.2: Configure `next.config.ts`**
  - **Details:** Wrap the Next.js configuration with `createNextIntlPlugin`:
    ```typescript
    import type { NextConfig } from 'next';
    import createNextIntlPlugin from 'next-intl/plugin';

    const withNextIntl = createNextIntlPlugin();

    const config: NextConfig = {
      poweredByHeader: false,
      reactStrictMode: true,
      devIndicators: false,
    };

    export default withNextIntl(config);
    ```
  - **Verification:** `npm run build` initializes plugin without configuration errors.

- [x] **Step 1.3: Create Request Configuration (`src/i18n/request.ts`)**
  - **Details:** Implement request config to resolve the active locale using cookie `NEXT_LOCALE`, header `accept-language`, or default `'en'`:
    ```typescript
    import { getRequestConfig } from 'next-intl/server';
    import { cookies, headers } from 'next/headers';
    import { localeCookie, resolveLocale } from './locale';

    export default getRequestConfig(async () => {
      const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
      const locale = resolveLocale(
        cookieStore.get(localeCookie)?.value,
        headerStore.get('accept-language') ?? '',
      );

      return {
        locale,
        messages: (await import(`../../messages/${locale}.json`)).default,
        timeZone: 'UTC',
      };
    });
    ```
  - **Verification:** TypeScript validates `src/i18n/request.ts` with no type errors.

- [x] **Step 1.4: Update Root Layout (`src/app/layout.tsx`)**
  - **Details:** Load messages and locale dynamically on the server and wrap children in `NextIntlClientProvider`:
    ```typescript
    import { NextIntlClientProvider } from 'next-intl';
    import { getLocale, getMessages, getTranslations } from 'next-intl/server';

    export default async function RootLayout({ children }: { children: React.ReactNode }) {
      const [locale, messages, t] = await Promise.all([
        getLocale(), getMessages(), getTranslations('nav'),
      ]);

      return (
        <html
          lang={locale}
          className={`${dmSans.variable} ${pixelifySans.variable}`}
          data-scroll-behavior="smooth"
        >
          <body>
            <NextIntlClientProvider locale={locale} messages={messages}>
              <a className="skip-link" href="#main-content">
                {t('skipLink')}
              </a>
              {children}
            </NextIntlClientProvider>
          </body>
        </html>
      );
    }
    ```
  - **Verification:** `npm run typecheck` passes.

---

### Phase 2: Message Catalogs & Parity Testing

- [x] **Step 2.1: Establish `messages/en.json`**
  - **Details:** Extract all user-facing strings into structured namespaces:
    - `common`: Generic actions (Save, Cancel, Close, Edit, Try again, Back to tavern, Loading, Game master, Player).
    - `nav`: Skip link, navigation links, open source badge.
    - `hub`: Hero title/copy, feature steps, create/join tabs, form labels, placeholders, footnotes, recent tables, empty state.
    - `tabletop`: Nav bar, invite link, tools (Paint, Pan, Move), overlays (Grid, Collisions, Fog), GM controls (Movement, Spawn, Player relocation), terrain labels, scene management actions and modals, mobile controls.
    - `dice`: Dice notation parser labels, quick roll chips, attribute check buttons, roll history, critical success/failure badges, empty history note.
    - `classes`: Archetype selection, card traits, attribute descriptions, character appearance options (hair styles, colors), catalog manager controls.
    - `health`: Current HP, max HP, GM bonus, adjustment dialog, damage/heal actions, unconscious badge.
    - `errors`: 404 and 500 error titles, descriptions, and action buttons.
  - **Verification:** JSON parses cleanly and contains zero syntax errors.

- [x] **Step 2.2: Establish `messages/pt-BR.json`**
  - **Details:** Provide Brazilian Portuguese translations tailored to tabletop RPG culture (e.g. "Mestre do Jogo", "Ficha do Aventureiro", "Névoa de Guerra", "Rolagem de Dados", "Acerto Crítico!").
  - **Verification:** JSON parses cleanly and mirrors the exact key structure of `en.json`.

- [x] **Step 2.3: Establish `messages/es.json`**
  - **Details:** Provide Spanish translations tailored to tabletop RPG culture (e.g. "Director de Juego", "Hoja del Aventurero", "Niebla de Guerra", "Tirada de Dados", "¡Crítico natural!").
  - **Verification:** JSON parses cleanly and mirrors the exact key structure of `en.json`.

- [x] **Step 2.4: Create Translation Parity Unit Tests (`tests/i18n.test.ts`)**
  - **Details:** Write unit tests comparing all keys recursively between `en.json`, `pt-BR.json`, and `es.json` to guarantee 100% key parity and absence of empty strings or missing keys.
  - **Verification:** `npm test` runs and passes `tests/i18n.test.ts`.

---

### Phase 3: Language Switcher & Hub Localization

- [x] **Step 3.1: Build Accessible `<LanguageSwitcher />` Component**
  - **Details:** Create `src/components/ui/language-switcher.tsx` with:
    - Clean dropdown or compact select using Radix UI / custom styling.
    - Options: English (`en`), Español (`es`), Português (`pt-BR`).
    - Handlers setting cookie `NEXT_LOCALE=${locale}; path=/; max-age=31536000; SameSite=Lax` and calling `router.refresh()`.
    - Local storage sync for client resilience and aria-label for accessibility.
  - **Verification:** Component compiles cleanly with TypeScript and renders accessible buttons/menu.

- [x] **Step 3.2: Localize Hub Component (`src/components/hub.tsx`)**
  - **Details:**
    - Replace hardcoded text with `useTranslations('hub')`, `useTranslations('common')`, and `useTranslations('nav')`.
    - Embed `<LanguageSwitcher />` in the Hub navigation bar and mobile view.
    - Ensure dynamic interpolation for room counts, table titles, and tooltips.
  - **Verification:** Hub renders in English by default, displays switcher, and changes language dynamically when cookie is updated.

- [x] **Step 3.3: Localize Error & Not-Found Pages**
  - **Details:**
    - Localize `src/app/not-found.tsx` using `useTranslations('errors')`.
    - Localize `src/app/error.tsx` using `useTranslations('errors')`.
  - **Verification:** `npm run typecheck` and manual/automated route verification.

---

### Phase 4: Tabletop, Canvas HUD & Scene Management Localization

- [x] **Step 4.1: Localize Tabletop Interface (`src/components/tabletop.tsx`)**
  - **Details:**
    - Wire `useTranslations('tabletop')` and `useTranslations('common')` into topbar, navigation, notices, and tool buttons.
    - Localize scene drawer: "New scene", "Rename scene", "Duplicate current scene", "Move scene up/down", "Remove scene", "Export map", "Import map".
    - Localize confirmation dialogs and error alerts.
    - Embed `<LanguageSwitcher />` in the tabletop header/sidebar for both GM and players.
  - **Verification:** `npm run typecheck` passes; tabletop controls render correctly in all three languages.

- [x] **Step 4.2: Localize Canvas 2D HUD Overlays (`src/components/canvas/map-canvas.tsx`)**
  - **Details:**
    - Wire translations for floating top HUD banners ("Select a player to move", "Players can move freely", "Movement paused by GM", "Set spawn point").
    - Ensure canvas pass-through clicks and keyboard shortcuts remain completely intact.
  - **Verification:** HUD displays translated strings without breaking canvas layout or event handling.

- [x] **Step 4.3: Localize Terrain Palette & Swatch Labels (`src/lib/terrain.ts`)**
  - **Details:**
    - Update `terrainInfo` or create a translation helper `getTerrainLabel(terrain, t)` so brush dock swatch labels ("Grass", "Forest", "Water", "Mountain", "Path", "Wall", "Sand", "Snow", "Flowers", "Erase") display localized tooltips.
  - **Verification:** Palette tooltips display localized names with correct shortcut keys (1-0).

---

### Phase 5: Dice Sidebar, Character Onboarding & Health Systems

- [x] **Step 5.1: Localize Dice System (`src/components/dice-sidebar.tsx`)**
  - **Details:**
    - Localize quick roll buttons, expression input placeholder, "Roll dice" button.
    - Localize attribute check chips (e.g., "STR (+2)", "FOR (+2)", "DES (+1)").
    - Localize roll card roles ("Game master" / "Player"), timestamps, and critical result badges ("Natural 20!", "Critical failure").
  - **Verification:** Dice sidebar renders and rolls accurately in all languages.

- [x] **Step 5.2: Localize Character Creator & Archetype Selection**
  - **Details:**
    - In `src/components/character-creator.tsx`: Localize step headers ("Meet your adventurer", "Appearance"), hair styles, colors, and button labels ("Next: Appearance", "Enter tabletop", "Save character").
    - In `src/components/class-picker.tsx` & `src/components/class-summary.tsx`: Localize class overview cards, attribute modifier labels, narrative traits, and health bonuses.
  - **Verification:** Onboarding flow completes with localized text.

- [x] **Step 5.3: Localize Class Manager (`src/components/class-manager.tsx`)**
  - **Details:**
    - Localize GM modal for editing classes, subclasses, attribute modifiers, health modifiers, and traits.
    - Preserve backend validation schemas and attribute IDs (`forca`, `destreza`, etc.) while displaying localized labels.
  - **Verification:** GM can configure and save class catalogs in any locale.

- [x] **Step 5.4: Localize Health Editor & Indicators**
  - **Details:**
    - In `src/components/health-editor.tsx` and `src/components/health-status.tsx`: Localize HP labels, damage/heal buttons, override modal inputs, and unconscious indicators.
  - **Verification:** Health popovers display localized labels and adjust HP seamlessly.

---

### Phase 6: Automated Verification & E2E Testing

- [x] **Step 6.1: End-to-End Internationalization Tests (`tests/e2e/i18n.spec.ts`)**
  - **Details:** Add Playwright tests verifying:
    - Default English rendering on initial visit.
    - Language switching to Portuguese (`pt-BR`) via `<LanguageSwitcher />` updates Hub content immediately.
    - Language switching to Spanish (`es`) updates Hub content immediately.
    - Selected language persists across page navigation (`/` to `/room/[code]`) and browser reloads.
    - Tabletop UI (toolbars, dice, scenes, character creator) renders in the active locale.
  - **Verification:** `npx playwright test tests/e2e/i18n.spec.ts` passes.

- [x] **Step 6.2: Regression Verification for Existing Tests**
  - **Details:** Run existing test suites to confirm that English defaults preserve previous workflows, with localized preset/attribute display expectations updated as described in the reconciled checklist:
    - Unit/integration suite: `npm run test` (all 60+ tests passing).
    - Existing E2E specs: `tests/e2e/tavern.spec.ts`, `tests/e2e/dice.spec.ts`, `tests/e2e/classes.spec.ts`, `tests/e2e/health.spec.ts`, `tests/e2e/map-editor.spec.ts`.
  - **Verification:** All tests pass with zero regressions.

---

## 4. Final Completion Gate

- [x] `npm test`: All unit, domain, and i18n parity tests pass.
- [x] `npm run typecheck`: TypeScript passes with strict checks.
- [x] `npm run lint`: ESLint passes with no warnings or errors.
- [x] `npm run format:check`: Prettier confirms proper formatting.
- [x] `npm run build`: Production Next.js build succeeds.
- [x] `npm run test:e2e`: Playwright passes across all specifications.
- [x] Review `git status` / `git diff` for intended changes and run `git diff --check`.

### Execution results (2026-10-04)

Implementation is complete. Final verification passes all 65 unit/domain/integration tests and 29 browser tests, plus TypeScript, ESLint, Prettier, and the production build. Browser tests run with one worker to respect the application's shared-IP API rate limit.

The six i18n browser tests cover all three locales, header negotiation and cookie precedence, localized 404s and validation, preference recovery and unavailable storage, desktop/mobile controls down to 320px, form drafts, independent GM/player languages, preserved canvas/session state, and synchronized attribute rolls and health. Unit tests verify catalog keys/placeholders, nonempty translations, fallback negotiation, canonical error handling, and unchanged custom/catalog data. Existing game workflows remain covered by the regression suite.
