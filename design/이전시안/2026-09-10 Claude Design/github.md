repo: jiing2222/Diary-Designer
branch: main

## Last sync
date: 2026-09-05T13:29:49Z

### Updated in this project
- PrintSlotEditor.tsx·RepeatPrint.tsx·SlotAssign.tsx·PaperPreview.tsx·App.tsx(인쇄하기 탭) 정독, 실제 인쇄 화면 구조·상태 파악
- 인쇄하기 화면 초안 제작: 상단바(양식명·규격, PDF Export, 햄버거 메뉴) + 옵션바(실제 인쇄 모습만 보기·양면 인쇄·뒷면 왼쪽·뒷면 180도) + 매수/칸 배정 바(SlotAssign 참고) + 용지 미리보기(M6 2×2 배치, 재단선) + 하단 상태바
- 이전 동기화의 "속지 제작" 속성 패널 전체 구현 반영 완료

## Sync history
- 2026-09-05T05:27:33Z — StyleBar.tsx·ObjectControls.tsx·EditorTab.tsx·InsertView.tsx 정독, 속지 제작 좌측 속성 패널 전체 구현
- 2026-09-05T00:41:35Z — 저장소 연결 확인, 구조 파악 (README.md·CLAUDE.md·app/src/ui 트리); 화면별 상세 코드는 미독

## Screen map
| 프로젝트 화면 | 리포 파일 |
|---|---|
| 양식 관리 갤러리 | app/src/ui/GalleryTab.tsx |
| 속지 제작 (Inserts) | app/src/ui/InsertView.tsx, EditorTab.tsx, StyleBar.tsx, ObjectControls.tsx |
| 노트 제작 (Notebooks) | app/src/ui/NotebookEditorTab.tsx, NotebookHalfEditor.tsx, NotebookMarginGuide.tsx |
| 인쇄하기 (Print) | app/src/ui/PaperPreview.tsx, PunchGuide.tsx, RepeatPrint.tsx |
| 시작화면 (Rings) | 리포에 없음 — 이 프로젝트에서 신규 제작 |
