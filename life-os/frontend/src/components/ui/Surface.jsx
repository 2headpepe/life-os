export default function Surface({ as: Tag = 'section', className = '', children, ...props }) {
  return <Tag className={`ds-surface ${className}`} {...props}>{children}</Tag>
}
