/// <reference path="../pb_data/types.d.ts" />
// rings_docs 컬렉션 — 리뉴얼 8-2. 작업·다이어리·폴더·글자 스타일·팔레트·글꼴·이미지 하나하나가 한 칸이다
// (app/src/core/sync). 옛 projects(한 사람에 한 벌)는 지우지 않고 그대로 둔다.
// 규칙 다섯 칸이 전부 "user = @request.auth.id" — 비우면 누구나 허용이다.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const own = 'user = @request.auth.id';
    app.save(
      new Collection({
        type: 'base',
        name: 'rings_docs',
        listRule: own,
        viewRule: own,
        createRule: own,
        updateRule: own,
        deleteRule: own,
        fields: [
          { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { name: 'kind', type: 'text', required: true, max: 20 },
          { name: 'key', type: 'text', required: true, max: 100 },
          // 217쪽짜리 날짜 작업도 들어가게 넉넉히.
          { name: 'data', type: 'json', maxSize: 20000000 },
          // 지움 표시 — 다른 기기에서도 지우게 칸은 남긴다.
          { name: 'deleted', type: 'bool' },
          // 글꼴·이미지 파일(8-2c). 글꼴 한 개가 수 MB라 20MB까지. 보호 — 주소만으로는 못 받고 본인 토큰이 있어야 한다.
          { name: 'file', type: 'file', maxSelect: 1, maxSize: 20971520, protected: true },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_rings_docs_key ON rings_docs (user, kind, key)'],
      }),
    );
  },
  (app) => app.delete(app.findCollectionByNameOrId('rings_docs')),
);
