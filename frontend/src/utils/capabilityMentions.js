export function findCapabilityMention(input, cursor) {
  return input.slice(0, cursor).match(/(?:^|\s)@([^\s]*)$/);
}

export function insertCapabilityMention(input, cursor, token) {
  const match = findCapabilityMention(input, cursor);
  if (!match) return null;
  const start = cursor - match[1].length - 1;
  return {
    text: `${input.slice(0, start)}${token} ${input.slice(cursor)}`,
    cursor: start + token.length + 1,
  };
}
