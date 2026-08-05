# CLAUDE.md

## 이 프로젝트 (System Diary Designer)

다이어리 속지를 만들어 PDF로 뽑는 웹앱. **한국어로 대화하고, 주석도 한국어로 쓴다.**
설계는 [설계문서.md](설계문서.md), 지금까지의 기록은 [진행상황.md](진행상황.md)에 있다.

### 층 — 어디에 코드를 둘지

```
core/   계산만. 화면도 PDF도 모른다. React가 없다.   ← 테스트는 여기에
pdf/    pdf-lib으로 그린다                            ← 테스트 있음
ui/     React·SVG로 그린다                            ← 테스트 없음
store.ts  zustand 한 개                               ← 테스트 있음
```

**`core/`는 `ui/`·`pdf/`를 import하지 않는다.** 지금 0곳이다. 이 선을 넘지 않는다.

### 화면과 PDF는 독립적인 두 뷰다 — 같은 값을 두 번 적지 않는다

둘은 그리는 방법이 전혀 다르지만 **결과가 같아야 한다.** 그래서 "이 선이 실제로
몇 mm인가", "이 글자가 어디에 앉는가" 같은 판단은 core가 한 번만 한다.

```
core/line.ts   widthOf · colorOf · dashOf · dashPattern
core/text.ts   sizeOf · alignOf · valignOf · lineHeightOf · lineBaselines · anchorX
```

뷰에서 `o.width ?? 기본값`을 직접 적으면 **안 된다.** 주석으로 "화면과 같은 값을
쓴다"고 약속하는 것도 안 된다 — 강제가 아니다. 이 프로젝트는 이미 두 번 당했다:

- `OBJECT_LINE_CAP`을 화면만 `round`, PDF는 `butt`로 둬서 **인쇄물에서만** 굵은
  선의 꼭짓점이 끊겼다
- 점선 비율 `6·4·1·3`이 두 파일에 각각 적혀 있었다 (core/line으로 모아 해결)

새 속성을 더할 때는 **먼저 core에 `xxxOf`를 만들고** 두 뷰가 그걸 부르게 한다.

### 단위는 mm 하나뿐이다

문서 모델의 모든 좌표·치수는 mm다. 예외 없다. pt와 px로 바꾸는 것은 그리는
순간에만 (`core/units.ts`). 글자 크기만 입력을 pt로 받고 **받는 즉시 mm로 바꿔**
저장한다.

### 값이 없으면 기본값을 따른다

객체의 `width`·`color`·`size` 등은 **정한 것만 값을 지닌다.** 손대지 않은 것은
키가 아예 없어서 나중에 기본값을 바꾸면 전부 같이 따라온다. `cleanStyle()`이
`undefined` 키를 걷어내는 이유다. 색·굵기 기본값은 전부 `core/style.ts`에 있다.

속성 막대에는 `기본`이라는 선택지를 두지 않는다. 목록에서 기본값에 해당하는
항목의 value가 빈 문자열이라 그냥 처음부터 골라져 있다.

### 새 객체 종류를 더할 때

`isLine`/`isText`처럼 판별 함수를 만들고, 두 뷰에 레이어를 하나씩 붙인다.
기존 레이어를 헤집지 않는다.

```
ui/InsertView.tsx   objects.filter(isText) → <TextLayer>
pdf/export.ts       objects.filter(isText) → drawTexts()
```

### 작업 방식

- **코드 작성 전에 구조를 먼저 설명하고 동의를 받는다.** 큰 덩어리를 한 번에 받으면
  검토가 어렵다.
- 각 단계는 끝날 때 **실제로 실행되는 결과물**이 나오도록 쪼갠다.
- 기능을 늘리는 것보다 빠른 완성이 우선이다. 애매하면 뺀다.
- 인쇄해봐야 아는 값은 추측하지 않는다. 진행상황.md의 `아직 인쇄해보지 않은 값`에
  적어두고 사용자에게 물어본다.

---

## 일반 지침

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
