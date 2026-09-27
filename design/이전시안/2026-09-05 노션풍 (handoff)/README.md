# Handoff: Rings — Main Landing Page + Inserts (Template) Editor

## Overview
Redesign of the Rings diary-designer app's marketing landing page and its template/insert editor screen, following a Notion-style visual language: minimal chrome, thin 1px borders, hover-revealed actions, restrained color, clear hierarchy.

## About the Design Files
The files in this bundle (`main-page.html`, `inserts-editor.html`) are **design references built as HTML prototypes** — they show intended look, layout, and interaction, not production code to copy as-is. Recreate these designs in the target codebase's existing stack (the `Diary-Designer` repo — check its current framework, likely React/TypeScript) using its established components, state management, and patterns. Do not paste the raw HTML/inline-styles into the app; port the design intent (structure, spacing, colors, typography, interactions) into the app's real components (e.g. `StyleBar.tsx`, `ObjectControls.tsx`, `EditorTab.tsx`, `InsertView.tsx`).

## Fidelity
**High-fidelity (hifi).** Colors, spacing, typography, and interaction states are final — implement pixel-close, adapting only to the codebase's component/layout conventions.

## Screens

### 1. Main landing page (`main-page.html`)
**Purpose:** Marketing entry point; explains the product and funnels users into the editor.

**Layout:**
- Sticky header, `max-width:1120px` centered container, `56px` tall, `1px solid #dededa` bottom border, background `#f4f4f2`.
- Header contents (flex row, `gap:24px`): logo (two overlapping ring circles as SVG, `20–22px`, one stroke `#2f6f4f`, one `#1c1c1a`) + wordmark "Rings" (15px/600) → nav (Template / Inserts / Notebooks / Print, text buttons, 13px/500, hover bg `#eaeae6`, radius 4px) → right-aligned auth (로그인 text button) + primary CTA button (`#2f6f4f` bg, white text, radius 4px, hover `#275d42`).
- Hero section: centered column, `padding:112px 0 0`. H1 `clamp(44px,7.4vw,92px)`/600, line-height 1.06, letter-spacing -2.4px, with a pill-highlighted word (bg `#e3ede7`, text `#2f6f4f`, `border-radius:999px`). Subhead paragraph 15px/500, color `#7a7a74`, max-width 520px. Button row (primary CTA + secondary outlined button, `1px solid #dededa`). Small meta line below (spec list + separator dot + "no signup" note), 11px/500, `#7a7a74`.
- Product preview section below hero: a bordered card (`1px solid #dededa`, `border-radius:8px`, white bg) containing a mini tab bar (Inserts/Template/Print, active tab bg `#eeeeea`) + spec label right-aligned, then a 3-column mock of the editor (left tool list, center SVG canvas preview of a diary insert with dot grid/table/calendar, right property panel with X/Y/width/height fields).

**Components / states:** all buttons have `style-hover` background changes; no active/focus states beyond hover; CTA click navigates to the template gallery.

### 2. Inserts (template) editor (`inserts-editor.html`)
**Purpose:** Canvas-based editor for designing a diary insert/template (drawing shapes, text, images, calendar auto-fields) at real mm dimensions.

**Layout (top to bottom, full-height flex column, `overflow:hidden`):**
- **Top bar** (52px, white, bottom border `#dededa`): logo/wordmark (links home) → flexible spacer → center cluster (editable title field, contentEditable with focus ring `#2f6f4f`; paper-size dropdown button "62 × 105mm"; undo/redo icons) → flexible spacer → right cluster (hamburger menu button opening a dropdown card with Template/Inserts(active,`#e3ede7`/`#2f6f4f`)/Notebooks(disabled)/Print links; primary green "Download" button).
- **Body row** (`flex:1`, three columns):
  1. **Tool rail** (68px, white, right border): vertical icon+label buttons — Select(V), Draw(D), Text(T), Image(I), AutoField(C/F). Active tool: green bg `#2f6f4f`, white icon/label; inactive hover `#f2f2ee`.
  2. **Properties panel** (white, right border, ~135–150px wide, scrollable): content swaps per active tool.
     - *Select*: helper text only.
     - *Draw*: sub-tabs Draw/Table/Checkbox (stacked vertical icon+label rows, active = white bg + `2px solid #2f6f4f` border + green text, inactive = `#f4f4f2` bg + `1px solid #dededa` + gray text). Each sub-tab shows relevant fields: Draw → line width dropdown, line color swatch, style dropdown, corner style; Table → table line width/color/style, border corner; Checkbox → 3×2 icon grid (square/circle/triangle/diamond/star/heart, selected = green outline+bg), stroke width + color.
     - *Text*: font dropdown, bold toggle, size (pt) stepper, line-height (mm) stepper, align (Left/Middle dropdowns), text color swatch, rotation dropdown.
     - *Image*: choose-image button, width/height (mm) steppers, rotation stepper.
     - *AutoField*: sub-tabs Calendar/Field (same active-state style as Draw sub-tabs). Calendar → start-of-week toggle, weekday language, font, color, size %, row spacing %, spacing (mm), "show adjacent month dates" checkbox, title override field. Field → format dropdown (Day/etc.) + helper text about auto-incrementing stamps.
  3. **Canvas area** (`flex:1`, column): thin toolbar (40px, white, bottom border) with contextual actions — Erase (hover red-tinted `#f5e6e0`/`#b04a2f`), Lock, Unlock·Unlock all, Group, divider, Front/Back layer buttons (active = `#e3ede7`/`#2f6f4f`), view-only rotate icon. Below: centered scrollable canvas holding an SVG at true mm aspect ratio (62×105mm here) showing: dot-grid safe area, a date-header block (dashed guide lines, small circular day markers), a mini calendar grid block, a "DATE" label row with weekday abbreviations and a bordered auto-field box, then a two-column ruled table area (7 rows) for daily notes, with corner registration marks (small green squares) and one solid green dot bottom-right.
- **Bottom status bar** (32px, white, top border): insert size label, cell-count label, right-aligned cursor coordinates, zoom control (−, 100%, +).
- **Footer strip** (24px, `#f4f4f2` bg, muted 10px text): paper size, insert size, sheets-per-page, rotation note.

**Colors:** background `#f4f4f2`; surfaces `#ffffff`; borders `#dededa` (hover-darker `#c6c6c0`); primary/accent green `#2f6f4f` (hover `#275d42`), accent-tint `#e3ede7`; text `#1c1c1a` primary, `#7a7a74` secondary, `#b6b6b0` placeholder/disabled, `#a8a8a2` footer muted; destructive tint `#f5e6e0`/`#b04a2f` (Erase hover, date guide lines).

**Typography:** Pretendard (loaded via jsDelivr `pretendard.min.css`), fallback `-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`. Body copy 12–13px/500; section labels 11px/500 `#7a7a74`; wordmark 15px/600.

**Interactions implemented in the prototype:**
- Hamburger menu toggles an absolutely-positioned dropdown (click again to close).
- Tool rail buttons switch the active tool group, which swaps the entire properties panel content.
- Draw and AutoField groups have their own sub-tab state (Draw/Table/Checkbox, Calendar/Field) independent of the tool group.
- Front/Back layer buttons toggle a highlighted state (visual only in the prototype — wire to real z-order logic).
- All interactive elements have hover states; none of the dropdowns/steppers/color swatches actually open a picker in the prototype — those need real implementations (color picker, unit stepper with drag/scroll, searchable font dropdown).

## State Management (for the real implementation)
- Active tool (`select | draw | text | image | autofield`)
- Draw sub-tab (`draw | table | checkbox`) and AutoField sub-tab (`calendar | field`)
- Per-object properties bound to the currently selected canvas object(s) (line width/color/dash, corner radius, font, size, alignment, color, rotation, image dimensions, calendar formatting options)
- Menu open/closed
- Front/back (page side) — likely already exists in `InsertView`/`EditorTab`
- Undo/redo history (Redo is shown disabled in the mock; wire to real history stack)

## Design Tokens
- Colors: bg `#f4f4f2`, surface `#ffffff`, border `#dededa`, border-hover `#c6c6c0`, primary `#2f6f4f`, primary-hover `#275d42`, primary-tint `#e3ede7`, text `#1c1c1a`, text-muted `#7a7a74`, placeholder `#b6b6b0`, footer-muted `#a8a8a2`, destructive `#b04a2f`, destructive-tint `#f5e6e0`
- Radius: 4px (buttons, inputs), 6px (sub-tab buttons), 8px (cards, dropdown)
- Border: 1px solid `#dededa` default; 2px solid `#2f6f4f` for active sub-tab
- Font sizes: 9–11px (micro labels), 12–13px (body/buttons), 15px (wordmark), hero clamp(44–92px)

## Assets
- Pretendard webfont via CDN (`https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css`)
- All icons are hand-drawn inline SVG (no icon library) — line-based, `stroke-width:1.6–1.8`, no fill except a few solid dots/marks
- Canvas preview illustration (dot grid, calendar, table) is inline SVG at true mm coordinates — use as a visual reference for real canvas rendering, not literal markup

## Files
- `main-page.html` — landing page design
- `inserts-editor.html` — insert/template editor design (this is the fully tool-complete version: Select/Draw/Text/Image/AutoField, with Draw's Table/Checkbox sub-tabs and AutoField's Calendar/Field sub-tabs)

Repo reference: `jiing2222/Diary-Designer` (branch `main`) — cross-check against `app/src/ui/StyleBar.tsx`, `ObjectControls.tsx`, `EditorTab.tsx`, `InsertView.tsx` for existing prop/state shapes before wiring these designs in.
