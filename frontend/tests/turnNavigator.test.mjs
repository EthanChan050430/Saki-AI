import { parseTurns } from '../src/utils/chatTurnParser.js';

const mockMessages = [
  { role: 'user', content: '聊天气泡与底部聊天框之间的太紧凑了' },
  {
    role: 'assistant',
    parts: [
      {
        type: 'action',
        fileMetadata: {
          filePath: 'src/components/Chat.jsx',
          before: 'const a = 1;\n',
          after: 'const a = 1;\nconst b = 2;\n// extra\n',
        },
      },
    ],
  },
  { role: 'user', content: '? 谁让你做白底淡出了，而且还没居中' },
  {
    role: 'assistant',
    parts: [
      {
        type: 'action',
        fileMetadata: {
          filePath: 'src/components/Test.jsx',
          before: '1\n2\n3\n4\n5\n',
          after: '1\n',
        },
      },
    ],
  },
  { role: 'user', content: '检查未提交的代码有没有bug或者漏洞' },
  { role: 'assistant', parts: [{ type: 'text', content: '检查完毕，没有发现漏洞。' }] },
  { role: 'user', content: '行' },
];

const turns = parseTurns(mockMessages);
console.log('Total turns extracted:', turns.length);
turns.forEach((t) => {
  console.log(`Turn ${t.turnIndex}: "${t.previewText}" | +${t.added} -${t.removed} | domId: ${t.domId}`);
});

if (turns.length === 4) {
  console.log('PASS: Correct turn count');
} else {
  console.error('FAIL: Expected 4 turns, got', turns.length);
  process.exit(1);
}

if (turns[0].added === 2 && turns[0].removed === 0) {
  console.log('PASS: Turn 0 diff calculated correctly (+2 -0)');
} else {
  console.error('FAIL: Turn 0 diff wrong', turns[0]);
  process.exit(1);
}

if (turns[1].added === 0 && turns[1].removed === 4) {
  console.log('PASS: Turn 1 diff calculated correctly (+0 -4)');
} else {
  console.error('FAIL: Turn 1 diff wrong', turns[1]);
  process.exit(1);
}

if (turns[2].added === 0 && turns[2].removed === 0) {
  console.log('PASS: Turn 2 has 0 diff');
} else {
  console.error('FAIL: Turn 2 diff wrong', turns[2]);
  process.exit(1);
}

if (turns[3].previewText === '行') {
  console.log('PASS: Turn 3 preview text is "行"');
} else {
  console.error('FAIL: Turn 3 preview wrong', turns[3]);
  process.exit(1);
}

console.log('ALL TESTS PASSED!');
