/* eslint-disable react/prop-types */
export default function Tab({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-4 py-2 text-sm font-medium rounded-t-md transition-colors',
        active
          ? 'bg-white text-blue-700 border-x border-t border-gray-200 -mb-px'
          : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
      ].join(' ')}
      aria-current={active ? 'page' : undefined}
    >
      {label}
    </button>
  );
}
