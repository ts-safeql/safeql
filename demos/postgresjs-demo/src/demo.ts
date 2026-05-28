export function section(sectionName: string, callback: () => void) {
  void sectionName;
  callback();
}

export function example(exampleName: string, callback: () => unknown) {
  void exampleName;
  return callback();
}
