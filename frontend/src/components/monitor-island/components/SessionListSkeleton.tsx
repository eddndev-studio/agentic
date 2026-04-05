import React from 'react';

export function SessionListSkeleton() {
    return (
        <div className="p-2 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2.5 animate-pulse">
                    <div className="w-11 h-11 rounded-full bg-wa-bg-hover flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                        <div className="h-3 bg-wa-bg-hover rounded w-3/4" />
                        <div className="h-2.5 bg-wa-bg-hover rounded w-1/2" />
                    </div>
                </div>
            ))}
        </div>
    );
}
