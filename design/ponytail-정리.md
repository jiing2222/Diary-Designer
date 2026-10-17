# ponytail 정리 (2026-10-17~)

[ponytail](https://github.com/DietrichGebert/ponytail) 원칙으로 코드를 가볍게 한다 — 필요한 코드만, 이미 있는 것을 다시 쓰고,
**검증·오류 처리·보안·접근성은 빼지 않는다.** 동작은 바꾸지 않는다(리팩터링만).

중간에 멈추면(토큰 한도 등) 다음 세션은 이 파일의 ‘남음’ 첫 항목부터 이어간다.
항목마다: `cd app && npx vitest run` · `npx tsc -b` · `npx oxlint src`(경고 4개 기준) 통과 → 커밋 → renewal에 push → 여기 표시.

## 감사 결과 (큰 것부터)

| # | 태그 | 무엇을 | 대신 | 상태 |
|---|---|---|---|---|
| 1 | delete | pdf/export의 옛 입력(slotOverrides·totalSlots·defaultBack·backSlotOverrides·sheets·calendarYear) — 유일한 호출자 pdf/fromWork가 하나도 넘기지 않는다. 함께 core/sheetSlots.ts(+test) | 없음 | 완료(범위 줄임) |
| 2 | delete | (범위 줄임) core/template.ts·core/notebook.ts의 리뉴얼 전 편집 함수(newTemplate·newBack·backFromFront·duplicateTemplate·refreshTemplateIds·groupBySize·uniqueName·defaultName·printModeOf·insertFromPreset·ensureTemplateIdCounterAbove, 노트 인쇄·크기 함수들) — 테스트만 부른다 | 옛 자료 옮기기(project→migrate)와 인쇄가 쓰는 것만 남김 | 완료(범위 줄임) |
| 3 | delete | cloud/projects.ts — 어디서도 import하지 않는다(옛 양식 클라우드 저장). core/project.ts의 toProject·missingFonts·missingImages도 | 없음 | 완료 |
| 4 | delete | storage/autosave.ts — 어디서도 import하지 않는다(v2 이전 자동저장) | 없음 | 완료 |
| 5 | delete | ui/icons.tsx의 안 쓰는 아이콘 10개(TemplateIcon·GridIcon·PunchIcon·CursorIcon·EyeIcon·EyeOffIcon·RepeatIcon·MenuIcon·DownloadIcon·ChevronIcon) | 없음 | 완료 |
| 6 | reuse | 구멍 설정 줄(구멍 수·배치·묶음 간격·안전영역·구멍 지름)이 ui/Diaries.tsx와 ui/PagePanel.tsx에 두 벌 | 한 컴포넌트 | 완료 |
| 7 | reuse | 팔레트 칸 편집(포인트 추가·기본값 되돌리기)이 ui/EditorRail.tsx와 ui/LibraryColors.tsx에 두 벌 | 한 컴포넌트 | 남음 |
| 8 | delete | core/presets.ts의 SIZE_FAMILIES·familyOf·SizeFamily — import하는 곳 없음 | 없음 | 완료 |
| 9 | delete | ui/PaperPreview.tsx의 calendarYear 속성(넘기는 곳 없음), ui/Editor.tsx ToolBtn(안 씀) | 없음 | 완료 |
| 10 | delete | 안 쓰는 상수·타입: style TEXT_SNAP_COLOR·IMAGE_SNAP_COLOR, moon MOON_PHASE_NAMES, objects ImageStyle, format resolvePageObjects(테스트만) | 없음 | 완료 |

의존성: pdf-lib·fontkit·pocketbase·react·zustand — 모두 필요하다. 뺄 것 없음.

## 기록
- 2026-10-17 3·4·5·8·9·10 완료(-약 230줄): cloud/projects.ts·storage/autosave.ts 파일 삭제, project missingFonts·missingImages, presets 크기 갈래, Editor ToolBtn, 스냅 색 상수 2개, MOON_PHASE_NAMES, ImageStyle, format resolvePageObjects(+테스트), 안 쓰는 아이콘 10개, PaperPreview calendarYear 경로.
- 2번 범위 수정: template.ts의 ‘테스트만 부르는’ 함수 대부분은 **옛 자료 옮기기 테스트가 옛 파일을 만드는 도구**다(project.test 등). 지우면 옛 자료 보호 테스트가 사라지므로 남긴다. 테스트에서도 안 쓰는 것만 지운다.
- 2026-10-17 1 완료(-약 600줄, 테스트 포함): 낱장 조합(slotOverrides·backSlotOverrides)·반복 인쇄(totalSlots·sheets)와 core/sheetSlots·template capacityPerSheet·frontBackFilled 삭제. `defaultBack`·`calendarYear`는 세트형 경로의 대체값이고 양면 테스트가 기대므로 남김. 브라우저에서 단면 35쪽/양면 36쪽 PDF 확인.
- 2026-10-17 2 완료: 어디서도 안 쓰는 것은 notebook NotebookSlotRef 타입 하나뿐(나머지는 옛 자료 옮기기 테스트의 도구). **다음: 6번** — ui/PagePanel.tsx에 `PunchFields({ punch, height, onPatch })`를 만들어 Diaries.tsx의 ‘구멍’ 카드와 PagePanel의 PunchGroup이 같이 쓰게(Diaries는 이미 PagePanel에서 Num·Row를 가져온다). 그다음 7번.
- 2026-10-17 6 완료: ui/PagePanel `PunchFields` 하나를 Diaries ‘구멍’ 카드와 Page 패널이 같이 쓴다(-33줄). Page 패널에도 위치 미세 조정(접힘)이 생겼다. 두 화면에서 구멍 수 바꾸기 확인. **다음: 7번.**
