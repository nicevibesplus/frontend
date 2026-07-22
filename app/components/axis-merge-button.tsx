import { Link2 } from 'lucide-react'
import { Badge } from './ui/badge'
import { Separator } from './ui/separator'

interface AxisMergeButtonProps {
    canMerge: boolean
    handleMergeAxes: () => void
    axisUnits: string[] 
}

export function AxisMergeButton({ canMerge, handleMergeAxes, axisUnits }: AxisMergeButtonProps) {
    if (!canMerge) return null

    return (
        <button
            onClick={handleMergeAxes}
            title="Beide Achsen teilen dieselbe Einheit. Zusammenlegen, um Platz für weitere Sensoren zu machen."
            className="flex h-10 items-center justify-between bg-transparent px-3 py-2 text-sm focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        >
            <div className="inline-flex h-8 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium whitespace-nowrap ring-offset-white transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:ring-offset-slate-950 dark:hover:bg-slate-800 dark:hover:text-slate-50 dark:focus-visible:ring-slate-300">
                <Link2 className="mr-2 h-4 w-4" />
                Achsen zusammenlegen
                <Separator orientation="vertical" className="h-4 mx-2" />
                <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {axisUnits.join(', ')}
                </Badge>
            </div>
        </button>
    )
}