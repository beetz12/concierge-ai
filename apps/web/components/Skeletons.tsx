export function ProviderCardSkeleton() {
  return (
    <div className="p-4 rounded-lg border border-surface-highlight bg-surface animate-pulse">
      {/* Badge placeholder */}
      <div className="h-5 w-24 bg-slate-700/50 rounded mb-3" />

      {/* Title placeholder */}
      <div className="h-6 w-48 bg-slate-700/50 rounded mb-4" />

      {/* Stats row */}
      <div className="flex gap-4 mb-3">
        <div className="h-4 w-20 bg-slate-700/50 rounded" />
        <div className="h-4 w-24 bg-slate-700/50 rounded" />
        <div className="h-4 w-16 bg-slate-700/50 rounded" />
      </div>

      {/* Description lines */}
      <div className="space-y-2 mb-4">
        <div className="h-3 w-full bg-slate-700/50 rounded" />
        <div className="h-3 w-3/4 bg-slate-700/50 rounded" />
      </div>

      {/* Button placeholder */}
      <div className="h-10 w-full bg-slate-700/50 rounded-lg" />
    </div>
  );
}

export function RecommendedProvidersSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <ProviderCardSkeleton />
      <ProviderCardSkeleton />
      <ProviderCardSkeleton />
    </div>
  );
}

export function TimelineItemSkeleton() {
  return (
    <div className="flex gap-4 animate-pulse">
      {/* Icon placeholder */}
      <div className="flex-shrink-0">
        <div className="w-8 h-8 bg-slate-700/50 rounded-full" />
      </div>

      {/* Content placeholder */}
      <div className="flex-1 space-y-2">
        {/* Timestamp */}
        <div className="h-3 w-24 bg-slate-700/50 rounded" />

        {/* Title */}
        <div className="h-5 w-48 bg-slate-700/50 rounded" />

        {/* Description lines */}
        <div className="space-y-1.5">
          <div className="h-3 w-full bg-slate-700/50 rounded" />
          <div className="h-3 w-5/6 bg-slate-700/50 rounded" />
        </div>
      </div>
    </div>
  );
}

export function TimelineSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-6">
      {Array.from({ length: items }).map((_, i) => (
        <TimelineItemSkeleton key={i} />
      ))}
    </div>
  );
}

export function StatsCardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-surface-highlight bg-surface animate-pulse">
      {/* Icon and label */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-slate-700/50 rounded" />
        <div className="h-4 w-24 bg-slate-700/50 rounded" />
      </div>

      {/* Value */}
      <div className="h-8 w-16 bg-slate-700/50 rounded mb-2" />

      {/* Subtext */}
      <div className="h-3 w-32 bg-slate-700/50 rounded" />
    </div>
  );
}

export function StatsGridSkeleton({ items = 4 }: { items?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: items }).map((_, i) => (
        <StatsCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-6 py-4">
          <div className="h-4 bg-slate-700/50 rounded" />
        </td>
      ))}
    </tr>
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 5
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-highlight">
      <table className="min-w-full divide-y divide-surface-highlight">
        <thead className="bg-surface">
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i} className="px-6 py-3">
                <div className="h-4 bg-slate-700/50 rounded animate-pulse" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-highlight bg-surface/50">
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} columns={columns} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FormFieldSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {/* Label */}
      <div className="h-4 w-24 bg-slate-700/50 rounded" />

      {/* Input */}
      <div className="h-10 w-full bg-slate-700/50 rounded-lg" />
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <FormFieldSkeleton key={i} />
      ))}

      {/* Submit button */}
      <div className="pt-2">
        <div className="h-10 w-32 bg-slate-700/50 rounded-lg animate-pulse" />
      </div>
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Breadcrumb */}
      <div className="h-4 w-48 bg-slate-700/50 rounded" />

      {/* Title */}
      <div className="h-8 w-64 bg-slate-700/50 rounded" />

      {/* Description */}
      <div className="space-y-2">
        <div className="h-4 w-full max-w-2xl bg-slate-700/50 rounded" />
        <div className="h-4 w-2/3 bg-slate-700/50 rounded" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 rounded-lg border border-surface-highlight bg-surface animate-pulse">
      <div className="space-y-4">
        {/* Header */}
        <div className="h-6 w-40 bg-slate-700/50 rounded" />

        {/* Content lines */}
        <div className="space-y-2">
          <div className="h-4 w-full bg-slate-700/50 rounded" />
          <div className="h-4 w-5/6 bg-slate-700/50 rounded" />
          <div className="h-4 w-4/6 bg-slate-700/50 rounded" />
        </div>
      </div>
    </div>
  );
}

export function ListItemSkeleton() {
  return (
    <div className="flex items-center gap-4 p-4 rounded-lg border border-surface-highlight bg-surface animate-pulse">
      {/* Avatar/Icon */}
      <div className="w-12 h-12 bg-slate-700/50 rounded-full flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 space-y-2">
        <div className="h-5 w-48 bg-slate-700/50 rounded" />
        <div className="h-3 w-32 bg-slate-700/50 rounded" />
      </div>

      {/* Action */}
      <div className="w-8 h-8 bg-slate-700/50 rounded" />
    </div>
  );
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
  );
}

export function ButtonSkeleton({
  variant = 'default'
}: {
  variant?: 'default' | 'small' | 'large'
}) {
  const sizeClasses = {
    small: 'h-8 w-20',
    default: 'h-10 w-24',
    large: 'h-12 w-32',
  };

  return (
    <div className={`${sizeClasses[variant]} bg-slate-700/50 rounded-lg animate-pulse`} />
  );
}
