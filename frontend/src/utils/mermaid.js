let loading;
export function loadMermaid() {
  return loading ||= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false, theme: 'default', securityLevel: 'loose', fontFamily: 'inherit',
      suppressErrorNotifications: true, errorHandler: () => {}, parseError: () => {},
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
    });
    return mermaid;
  }).catch(error => { loading = undefined; throw error; });
}
