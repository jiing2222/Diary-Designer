/// <reference path="../pb_data/types.d.ts" />
// 개발자 계정 표시 — 켜진 계정에만 개발자 도구(Library → Pins)가 보인다(app/src/cloud/client의 developer).
// **관리자 화면에서만 켤 수 있다.** 사용자는 자기 계정 정보를 고칠 수 있으므로(비밀번호 변경 등),
// 가입·수정 요청에 이 칸이 들어 있으면 거절한다 — 안 막으면 누구나 스스로 개발자가 된다.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.add(new BoolField({ name: 'developer' }));
    users.createRule = '@request.body.developer:isset = false';
    users.updateRule = 'id = @request.auth.id && @request.body.developer:isset = false';
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    users.fields.removeByName('developer');
    users.createRule = '';
    users.updateRule = 'id = @request.auth.id';
    app.save(users);
  },
);
