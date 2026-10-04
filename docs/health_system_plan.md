# Plan: Character Health (HP) & GM Management

## 1. Overview & Objective

Adicionar o atributo de vida (Hit Points / HP) aos personagens em Tavern, onde todos os aventureiros possuem uma vida base idêntica (`DEFAULT_BASE_HP = 20`), modificável positiva ou negativamente pelas classes e subclasses (`healthModifier`), com autoridade plena do Game Master (GM) para ajustar a vida atual, sobrescrever a vida máxima e aplicar dano ou cura em tempo real.

---

## 2. Workspace & Codebase Audit

- **Affected files / modules:**
  - `src/types/game.ts`: interfaces `CharacterHealth`, `HealthAdjustmentRequest`, extensões em `Member`, `CharacterSubclass`, `CharacterClass`, `ClientEvents`, `ServerEvents`.
  - `src/lib/classes.ts`: constante `DEFAULT_BASE_HP = 20`, helper `calculateMaxHealth`, e presets de classes/subclasses com `healthModifier`.
  - `src/lib/validation.ts`: validação Zod para `healthModifier` (-100 a +100) e schema `healthAdjustmentSchema`.
  - `src/server/game.ts`: migração na carga para garantir `session.health` em jogadores legados, inicialização em `newSession`, recálculo em `updateCharacter` e `updateClasses`, e método autoritativo `adjustHealth`.
  - `src/server/gateway.ts`: handler para evento Socket.io `health:update` e broadcast de `health:updated` para a sala.
  - `src/lib/use-room.ts`: escuta de `health:updated`, atualização reativa do snapshot e action `adjustHealth`.
  - `src/components/canvas/map-canvas.tsx`: renderização da barra de vida sobre o token do personagem no Canvas 2D com status de perigo/inconsciente (0 HP).
  - `src/components/tabletop.tsx`: barra de vida e indicador numérico na lista de membros da sidebar, popover/botões de ajuste rápido de HP para GM e jogadores, e HUD inferior.
  - `src/components/class-manager.tsx`: campo de edição para o modificador de vida da classe/subclasse no modal do GM.
  - `src/components/class-summary.tsx` & `src/components/class-picker.tsx`: exibição de bônus/penalidade de vida e HP máximo previsto durante onboarding/troca de classe.
  - `docs/roadmap.md`: registro da Fase 8.
  - `docs/data-models.md` & `docs/architecture.md`: documentação técnica atualizada.
  - `tests/health.test.ts` & `tests/e2e/health.spec.ts`: suíte de testes de domínio, socket e Playwright.

- **Dependencies & Tools:**
  - Node.js >= 22.12.0, Next.js 16.3.8, React 19.3.0, TypeScript 5.9.3, Tailwind CSS v4, Socket.io 4.8.4, Zod 4.3.6, Playwright 1.58.2, Lucide React icons.
  - Scripts de verificação: `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`.

- **Current state & Assumptions:**
  - O GM não possui personagem nem token no tabuleiro (conforme ADR 0001). Portanto, o GM não possui barra de vida pessoal, atuando exclusivamente como árbitro/gerenciador.
  - Os 49 testes de integração/domínio existentes passam com sucesso.
  - O estado de `Session` persiste duravelmente em `.tavern/store.json` (FileStore) ou MongoDB (MongoStore). A adição de `health` é retrocompatível, inicializando dados padrão para sessões legadas sem quebrar o estado existente.

---

## 3. Implementation Phases

### Execution reconciliation (2026-10-04)

- Baseline verified: `npm test` passes all 49 existing tests; the health feature is pending. Existing plan/roadmap edits are preserved.
- Authorization resolves the actor from persisted state inside the mutation queue, checks the room's `gmId`, and restricts targets to players in that room. Forged roles and cross-room targets never grant access.
- Health requests use strict validation and reject simultaneous `current` and `delta`; either may be combined with a GM bonus. A GM must select a player.
- Legacy player health is initialized on load, with the selected class/subclass maximum; legacy GM health is removed. Existing catalogs without health modifiers treat them as zero. Migrations persist on the next successful mutation, matching existing catalog migration.
- Unconfigured player sessions start at 20/20 HP. The first character save fills current HP to its effective maximum, including class/subclass modifiers and any GM bonus, even while waiting for a free tile. Subsequent character/catalog changes preserve current HP and the GM bonus, clamp to the recalculated maximum, and never automatically heal. Zero HP is a visual state and does not impose movement/combat rules.
- Interface copy follows the existing English UI. Reusable health display/editor components may be extracted from `tabletop.tsx`; controls use the existing accessible native modal (focus containment, Escape, focus return) for the adjustment popover.
- Add regressions for failed persistence, concurrent deltas, forged roles, cross-room access, strict input validation, legacy migration, room-isolated Socket.io events, reconnect and canvas health colors.
- Verify formatting as well as the five planned checks. Live MongoDB verification remains conditional on `MONGODB_TEST_URI`.

### Phase 1: Domain Models, Presets & Validation

- [x] **Step 1.1: Extend Game Types**
  - **Details:**
    - Adicionar `CharacterHealth` em `src/types/game.ts`:
      ```typescript
      export interface CharacterHealth {
        current: number;
        max: number;
        gmBonus?: number;
      }
      ```
    - Estender `Member` com `health?: CharacterHealth`.
    - Adicionar `healthModifier?: number` a `CharacterSubclass` (e portanto herdado por `CharacterClass`).
    - Adicionar `HealthAdjustmentRequest`:
      ```typescript
      export interface HealthAdjustmentRequest {
        memberId?: string;
        current?: number;
        delta?: number;
        gmBonus?: number;
      }
      ```
    - Estender `ClientEvents` com `'health:update': (request: HealthAdjustmentRequest, ack: Ack<CharacterHealth>) => void`.
    - Estender `ServerEvents` com `'health:updated': (update: { memberId: string; health: CharacterHealth }) => void`.
  - **Verification:** `npm run typecheck`

- [x] **Step 1.2: Add Health Helper & Class Presets**
  - **Details:**
    - Em `src/lib/classes.ts`:
      - Declarar `export const DEFAULT_BASE_HP = 20;`.
      - Criar função pura:
        ```typescript
        export function calculateMaxHealth(
          characterClass?: Pick<CharacterClass, 'healthModifier'>,
          subclass?: Pick<CharacterSubclass, 'healthModifier'>,
          gmBonus = 0,
        ): number {
          const mod = (characterClass?.healthModifier ?? 0) + (subclass?.healthModifier ?? 0);
          return Math.max(1, DEFAULT_BASE_HP + mod + gmBonus);
        }
        ```
      - Atualizar `defaultClasses` com modificadores temáticos:
        - Guerreiro: `healthModifier: 4` (Guardião: `+2`, Duelista: `-1`)
        - Mago: `healthModifier: -2` (Arcanista: `0`)
        - Bárbaro: `healthModifier: 6` (Berserker: `+2`)
        - Arqueiro: `healthModifier: 0` (Rastreador: `+1`)
  - **Verification:** `npm run test`

- [x] **Step 1.3: Zod Schemas & Validation**
  - **Details:**
    - Em `src/lib/validation.ts`:
      - Definir `healthModifierSchema = z.number().int().min(-100).max(100).default(0)`.
      - Integrar `healthModifier: healthModifierSchema` em `subclassSchema`.
      - Criar `healthAdjustmentSchema`:
        ```typescript
        export const healthAdjustmentSchema = z
          .object({
            memberId: z.string().uuid().optional(),
            current: z.number().int().min(0).max(999).optional(),
            delta: z.number().int().min(-999).max(999).optional(),
            gmBonus: z.number().int().min(-100).max(100).optional(),
          })
          .refine(
            (data) =>
              data.current !== undefined || data.delta !== undefined || data.gmBonus !== undefined,
            'Provide an HP change or bonus.',
          );
        ```
  - **Verification:** `npm run test`

---

### Phase 2: Authoritative Server Logic & Realtime Synchronization

- [x] **Step 2.1: Server Session Health Lifecycle & Migration**
  - **Details:**
    - Em `src/server/game.ts`:
      - No construtor de `GameService`, migrar sessões carregadas do store: se `session.role === 'player'` e não houver `session.health`, calcular `max = calculateMaxHealth(...)` e definir `session.health = { current: max, max, gmBonus: 0 }`.
      - Em `newSession`: inicializar `session.health` para novos jogadores.
      - Em `updateCharacter`: na primeira criação, preencher `current` com o máximo efetivo; em edições posteriores, recalcular `max` preservando `gmBonus` e clampar `current` a `[0, nextMax]`, sem curar automaticamente.
      - Em `updateClasses`: ao alterar catálogo de classes, recalcular a vida máxima dos jogadores da sala.
      - Em `snapshot`: incluir `health` no payload dos membros públicos para visualização de todo o grupo.
  - **Verification:** `npm run test`

- [x] **Step 2.2: Implement `GameService.adjustHealth`**
  - **Details:**
    - Em `src/server/game.ts`:
      - Implementar método autoritativo `async adjustHealth(actor: Session, input: unknown)`:
        - Validar request com `healthAdjustmentSchema`.
        - Se `actor.role !== 'gm'`:
          - Rejeitar se tentar alterar outro jogador (`request.memberId && request.memberId !== actor.id`).
          - Rejeitar se tentar alterar `gmBonus`.
          - Permitir apenas alterar `current` ou aplicar `delta` no seu próprio HP, clampado em `0 <= current <= effectiveMax`.
        - Se `actor.role === 'gm'`:
          - Permitir alterar `current`, `delta` e `gmBonus` de qualquer jogador especificado em `request.memberId`.
          - Recalcular `max = calculateMaxHealth(cls, subcls, gmBonus)`.
          - Clampar `current` a `0 <= current <= max`.
        - Persistir com `this.mutate` e atualizar `room.updatedAt`.
        - Retornar `{ memberId, health }`.
  - **Verification:** `npm run test`

- [x] **Step 2.3: Socket Gateway & Client Hook Integration**
  - **Details:**
    - Em `src/server/gateway.ts`:
      - Adicionar listener para `'health:update'`.
      - Chamar `game.adjustHealth(member, request)`.
      - Emitir `'health:updated'` para o canal da sala `channel(member.roomId)`.
      - Atualizar presenças/snapshots.
    - Em `src/lib/use-room.ts`:
      - Registrar listener para `'health:updated'` atualizando reativamente o estado local de `snapshot.members` e `snapshot.you`.
      - Expor função `adjustHealth: (request: HealthAdjustmentRequest) => Promise<boolean>`.
  - **Verification:** `npm run typecheck`

---

### Phase 3: Token Canvas Rendering & HUD

- [x] **Step 3.1: Token Health Bar on 2D Map Canvas**
  - **Details:**
    - Em `src/components/canvas/map-canvas.tsx`:
      - No loop de renderização de tokens de jogadores (`drawCharacter`), desenhar uma barra de vida em estilo pixel art acima da placa de nome:
        - Largura: 24px, Altura: 3px, Borda escura `#172d2a`.
        - Preenchimento proporcional a `(current / max)`.
        - Cor dinâmica: Verde `#22c55e` (>50%), Amarelo/Laranja `#f59e0b` (25%-50%), Vermelho `#ef4444` (<25%).
        - Se `current === 0`: exibir indicador visual de inconsciente/caído (caveira ou etiqueta `KO`).
  - **Verification:** `npm run build`

- [x] **Step 3.2: Floating HUD Health Pill**
  - **Details:**
    - Em `src/components/tabletop.tsx`:
      - No container `.character-hud`:
        - Para jogador: exibir indicador `❤️ {current}/{max} HP` com barra de progresso em miniatura.
        - Para GM: ao selecionar um token de jogador no mapa, exibir a vida do jogador selecionado com botões rápidos de `[-]` e `[+]` diretamente no HUD superior do canvas.
  - **Verification:** `npm run typecheck`

---

### Phase 4: Party Sidebar & GM Adjustment Popover

- [x] **Step 4.1: Party List Health Status & Quick Popover**
  - **Details:**
    - Em `src/components/tabletop.tsx`:
      - Na lista de membros da sidebar (`.party-member-card` / `.member-list`):
        - Exibir barra de vida compacta e contagem numérica (`18/20 HP`) para cada jogador.
        - Clicar na vida abre um popover acessível de controle de vida:
          - Para o GM: botões de atalho `[-5] [-1] [+1] [+5]`, botão "Curar Total", campo numérico para definir HP atual exato e campo para bônus/ajuste de Vida Máxima do GM.
          - Para o Jogador (em seu próprio card): botões rápidos `[-1] [+1]` e campo de dano/cura.
  - **Verification:** `npm run lint` & `npm run typecheck`

- [x] **Step 4.2: Class Manager & Onboarding Class Cards**
  - **Details:**
    - Em `src/components/class-manager.tsx`:
      - Adicionar campo no `DefinitionEditor` para "Modificador de Vida" (`healthModifier`: -100 a +100).
    - Em `src/components/class-summary.tsx` e `src/components/class-picker.tsx`:
      - Exibir tag com o modificador de vida da classe (ex.: `+4 HP`, `-2 HP`) e o cálculo de vida máxima total resultante (`Vida Máxima: 24 HP`).
  - **Verification:** `npm run build`

---

### Phase 5: Automated Testing & Verification

- [x] **Step 5.1: Unit & Integration Test Suite**
  - **Details:**
    - Criar `tests/health.test.ts` cobrindo:
      - Vida base de 20 HP aplicada a todos os personagens.
      - Modificadores de classe e subclasse somados corretamente na vida máxima.
      - Autoridade do GM: GM pode alterar vida de qualquer jogador e aplicar `gmBonus`.
      - Restrições do jogador: jogador só pode alterar seu próprio HP e não pode alterar `gmBonus`.
      - Clamping rigoroso: o HP não pode ficar negativo nem ultrapassar o HP máximo efetivo.
      - Persistência e sobrevivência a reconexões e reinicialização do servidor.
      - Limpeza e recálculo de vida máxima ao editar ou deletar classes do catálogo.
  - **Verification:** `npm run test`

- [x] **Step 5.2: End-to-End Browser Tests**
  - **Details:**
    - Criar `tests/e2e/health.spec.ts` com Playwright:
      - GM altera vida do jogador e a alteração reflete instantaneamente na tela do jogador.
      - Jogador sofre dano e a barra de vida no canvas e na sidebar atualiza com animação/cor correta.
      - Estado de 0 HP exibe badge de perigo.
  - **Verification:** `npm run test:e2e`

- [x] **Step 5.3: Update Documentation**
  - **Details:**
    - Atualizar `docs/data-models.md` com a especificação de `CharacterHealth`, `healthModifier` e o schema de eventos.
    - Atualizar `docs/architecture.md` refletindo o modelo de sincronização de vida.
  - **Verification:** `git diff docs/`

---

## 4. Final Completion Gate

- [x] Executar suíte completa de testes: `npm run test`
- [x] Executar suíte E2E: `npm run test:e2e`
- [x] Executar checagem de tipos TypeScript: `npm run typecheck`
- [x] Executar linter ESLint: `npm run lint`
- [x] Executar build de produção: `npm run build`
- [x] Verificar integridade e limpeza do git: `git status` e `git diff --check`

## 5. Execution evidence (2026-10-04)

All implementation steps and completion checks are complete. The original scope is retained with the reconciliation above.

| Check                             | Evidence                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain, persistence and Socket.io | `npm test`: 60 passed, 0 failed. `tests/health.test.ts` adds 10 health contracts, including full HP on first creation and preservation on edits; `tests/realtime.test.ts` adds the confirmed, room-isolated health/reconnect workflow.                                                      |
| Browser workflows                 | `npm run test:e2e`: 23 passed. `tests/e2e/health.spec.ts` covers GM/player synchronization, real canvas fill widths and green/amber/red colors, KO, HUD quick controls, full healing, maximum bonuses, class/subclass previews and edits, refresh, focus return, mobile and reduced motion. |
| Types, lint and formatting        | `npm run typecheck`, `npm run lint`, `npm run format:check`: exit 0.                                                                                                                                                                                                                        |
| Production                        | `npm run build`: exit 0; optimized Next.js build and all routes generated successfully.                                                                                                                                                                                                     |
| Documentation                     | `README.md`, `docs/architecture.md`, `docs/data-models.md`, and Phase 8 of `docs/roadmap.md` describe the shipped contracts and behavior.                                                                                                                                                   |
| Visual review                     | Desktop and 390px mobile screenshots inspected: `artifacts/health-desktop.png`, `artifacts/health-mobile.png`.                                                                                                                                                                              |

Implementation extracts reusable `HealthStatus`, `HealthEditor`, and `health.css` components. Browser verification uncovered native focus return failing when React detaches a dialog before its effect cleanup; `Modal` now explicitly restores the opening element, covered by the health workflow and the existing modal suites. No package changes were needed.

Live MongoDB integration was not run because `MONGODB_TEST_URI` was not configured. Durable migration/restart tests use the real FileStore and unchanged shared session records. Existing pending operational follow-ups in the roadmap remain outside Phase 8.
