declare module 'lucide-react/dynamicIconImports' {
  const dynamicIconImports: Record<string, () => Promise<unknown>>
  export default dynamicIconImports
}
