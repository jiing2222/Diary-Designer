/// <reference path="../pb_data/types.d.ts" />
// projects 컬렉션 — server/README 4절을 손으로 누르는 대신 이 파일 하나로 만든다.
// 규칙 다섯 칸이 전부 "user = @request.auth.id"인 게 핵심이다(비우면 누구나 허용).
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    const own = 'user = @request.auth.id';
    app.save(
      new Collection({
        type: 'base',
        name: 'projects',
        listRule: own,
        viewRule: own,
        createRule: own,
        updateRule: own,
        deleteRule: own,
        fields: [
          { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
          { name: 'data', type: 'json', required: true, maxSize: 5000000 },
          { name: 'created', type: 'autodate', onCreate: true },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_projects_user ON projects (user)'],
      }),
    );
  },
  (app) => app.delete(app.findCollectionByNameOrId('projects')),
);
