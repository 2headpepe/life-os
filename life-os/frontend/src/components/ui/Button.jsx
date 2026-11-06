export function Button({ variant = 'secondary', className = '', children, ...props }) {
  return <button className={`ds-button ds-button--${variant} ${className}`} {...props}>{children}</button>
}

export function IconButton({ label, className = '', children, ...props }) {
  return <button aria-label={label} title={label} className={`ds-icon-button ${className}`} {...props}>{children}</button>
}
