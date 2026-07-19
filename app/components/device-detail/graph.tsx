import {
    Chart as ChartJS,
    LineElement,
    TimeScale,
    CategoryScale,
    LinearScale,
    PointElement,
    Legend,
    Tooltip as ChartTooltip,
    Filler,
    type ChartOptions,
} from 'chart.js'
import 'chartjs-adapter-date-fns'
import { Download, RefreshCcw, X } from 'lucide-react'
import {
    useMemo,
    useRef,
    useState,
    useEffect,
    useContext,
    type RefObject,
} from 'react'
import { Scatter } from 'react-chartjs-2'
import { isBrowser, isTablet } from 'react-device-detect'
import Draggable, { type DraggableData } from 'react-draggable'
import { useNavigate, useNavigation, useSearchParams } from 'react-router'
import { AggregationFilter } from '../aggregation-filter'
import { ClientOnly } from '../client-only'
import { ColorPicker } from '../color-picker'
import { DateRangeFilter } from '../daterange-filter'
import { HoveredPointContext } from '../map/layers/mobile/mobile-box-layer'
import Spinner from '../spinner'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip'
import { Button } from '../ui/button'
import { datesHave48HourRange } from '~/lib/utils'
import { useTranslation } from 'react-i18next'

ChartJS.register(
    LineElement,
    TimeScale,
    CategoryScale,
    LinearScale,
    PointElement,
    ChartTooltip,
    Legend,
    Filler,
)

const GraphWithZoom = (props: any) => {
    useMemo(() => {
        void import('chartjs-plugin-zoom').then(({ default: zoomPlugin }) => {
            ChartJS.register(zoomPlugin)
        })
    }, [])

    return (
        <Scatter
            data={props.chartData}
            options={props.options}
            ref={props.chartRef}
        ></Scatter>
    )
}

interface GraphProps {
    aggregation: string
    sensors: any[]
    startDate?: string
    endDate?: string
}

export default function Graph({
    aggregation,
    sensors,
    startDate,
    endDate,
}: GraphProps) {
    const { setHoveredPoint } = useContext(HoveredPointContext)
    const navigation = useNavigation()
    const { t, i18n } = useTranslation('graph')
    const navigate = useNavigate()
    const [offsetPositionX, setOffsetPositionX] = useState(0)
    const [offsetPositionY, setOffsetPositionY] = useState(0)
    const [currentZoom, setCurrentZoom] = useState<{
        xMin: number
        xMax: number
    } | null>(null)
    const [searchParams, setSearchParams] = useSearchParams()
    const [colorPickerState, setColorPickerState] = useState({
        open: false,
        index: 0,
        color: '#000000',
    })
    const isAggregated = aggregation !== 'raw'

    const nodeRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<ChartJS<'scatter'>>(null)

    const dateTimeFormatter = useMemo(() => {
        return new Intl.DateTimeFormat(i18n.language, {
            dateStyle: 'medium',
            timeStyle: 'medium',
        })
    }, [i18n.language])

    useEffect(() => {
        if (chartRef.current) {
            const canvas = chartRef.current.canvas
            const handleMouseLeave = () => {
                setHoveredPoint(null)
            }
            canvas.addEventListener('mouseleave', handleMouseLeave)
            return () => {
                canvas.removeEventListener('mouseleave', handleMouseLeave)
            }
        }
    }, [chartRef, setHoveredPoint])

    const [theme] = 'light' //useTheme();

    const axisUnits: Record<string, string> = {}
    sensors.forEach((s) => {
        if (s.axisId) axisUnits[s.axisId] = s.unit
    })
    const activeAxes = Object.keys(axisUnits)
    const canMerge =
        activeAxes.length === 2 &&
        axisUnits['1'] === axisUnits['2'] &&
        !!axisUnits['1']

    function handleMergeAxes() {
        const mergedParts = sensors
            .map((s) => `${s.deviceId}/${s.id}/1`)
            .join('/')
        void navigate({
            pathname: `/explore/${mergedParts}`,
            search: searchParams.toString(),
        })
    }

    const generateDatasets = (sensors: any[], isAggregated: boolean) => {
        return sensors.flatMap((sensor, index) => {
            const dName =
                sensor.device_name ||
                sensor.deviceName ||
                `Gerät ${sensor.deviceId.substring(0, 4)}...`
            const label = sensor.displayName
                ? sensor.displayName
                : `${sensor.title} (${dName})`

            const yAxisID = sensor.axisId === '2' ? 'y1' : 'y'

            const baseDataset = {
                label,
                data: sensor.data.map((measurement: any) => ({
                    x: measurement.time,
                    y: measurement.value,
                    locationId: measurement.locationId,
                })),
                pointRadius: 2,
                borderColor: sensor.color,
                backgroundColor: sensor.color,
                yAxisID,
                fill: false,
                tension: 0.4,
            }

            if (isAggregated && sensors.length === 1) {
                const minDataset = {
                    ...baseDataset,
                    label: `${baseDataset.label} (Min)`,
                    data: sensor.data.map((measurement: any) => ({
                        x: measurement.time,
                        y: measurement.min_value,
                        locationId: null,
                    })),
                    borderColor: sensor.color + '33',
                    backgroundColor: sensor.color + '33',
                    fill: 1,
                }

                const maxDataset = {
                    ...baseDataset,
                    label: `${baseDataset.label} (Max)`,
                    data: sensor.data.map((measurement: any) => ({
                        x: measurement.time,
                        y: measurement.max_value,
                        locationId: null,
                    })),
                    borderColor: sensor.color + '33',
                    backgroundColor: sensor.color + '33',
                    fill: 1,
                }

                return [maxDataset, baseDataset, minDataset]
            }

            return [baseDataset]
        })
    }

    const [chartData, setChartData] = useState(() => ({
        datasets: generateDatasets(sensors, isAggregated),
    }))

    useEffect(() => {
        setChartData({
            datasets: generateDatasets(sensors, isAggregated),
        })
    }, [sensors, isAggregated])

    const options: ChartOptions<'scatter'> = useMemo(() => {
        const axis1Units = Array.from(
            new Set(sensors.filter((s) => s.axisId === '1').map((s) => s.unit)),
        ).join(', ')
        const axis2Units = Array.from(
            new Set(sensors.filter((s) => s.axisId === '2').map((s) => s.unit)),
        ).join(', ')

        return {
            maintainAspectRatio: false,
            responsive: true,
            spanGaps: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            parsing: {
                xAxisKey: 'x',
                yAxisKey: 'y',
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: datesHave48HourRange(
                            startDate ? new Date(startDate) : new Date(),
                            endDate ? new Date(endDate) : new Date(),
                        )
                            ? 'hour'
                            : 'day',
                        displayFormats: {
                            day: 'dd.MM.yyyy',
                            millisecond: 'mm:ss',
                            second: 'mm:ss',
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                        },
                        tooltipFormat: 'dd.MM.yyyy HH:mm',
                    },
                    min: currentZoom?.xMin,
                    max: currentZoom?.xMax,
                    ticks: {
                        major: {
                            enabled: true,
                        },
                        font: (context) => {
                            if (context.tick && context.tick.major) {
                                return { weight: 'bold' }
                            }
                        },
                        maxTicksLimit: 8,
                    },
                    grid: {
                        color:
                            theme === 'dark'
                                ? 'rgba(255, 255, 255)'
                                : 'rgba(0, 0, 0, 0.1)',
                        borderColor:
                            theme === 'dark'
                                ? 'rgba(255, 255, 255)'
                                : 'rgba(0, 0, 0, 0.1)',
                    },
                },
                y: {
                    title: {
                        display: true,
                        text: axis1Units || '',
                    },
                    display: true,
                    position: 'left',
                    grid: {
                        color:
                            theme === 'dark'
                                ? 'rgba(255, 255, 255)'
                                : 'rgba(0, 0, 0, 0.1)',
                        borderColor:
                            theme === 'dark'
                                ? 'rgba(255, 255, 255)'
                                : 'rgba(0, 0, 0, 0.1)',
                    },
                },
                y1: {
                    title: {
                        display: true,
                        text: axis2Units || '',
                    },
                    display: axis2Units.length > 0,
                    position: 'right',
                    grid: {
                        drawOnChartArea: false,
                    },
                },
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        title: (tooltipItems: any[]) => {
                            const firstItem = tooltipItems[0]
                            if (!firstItem) return ''
                            return dateTimeFormatter.format(
                                new Date(firstItem.raw.x),
                            )
                        },
                        label: (context: any) => {
                            const dataIndex = context.dataIndex
                            const datasetIndex = context.datasetIndex
                            const point =
                                chartData.datasets[datasetIndex].data[dataIndex]
                            const locationId = point.locationId

                            if (locationId) setHoveredPoint(locationId)

                            return `${context.dataset.label}: ${context.raw.y}`
                        },
                    },
                },
                zoom: {
                    zoom: {
                        wheel: { enabled: true },
                        drag: { enabled: true },
                        mode: 'x',
                        onZoom: ({ chart }) => {
                            const xScale = chart.scales['x']
                            setCurrentZoom({
                                xMin: xScale.min,
                                xMax: xScale.max,
                            })
                        },
                    },
                },
                legend: {
                    display: true,
                    position: 'bottom',
                    onHover: (e, legendItem, legend) => {
                        const canvas = legend.chart.canvas
                        if (legendItem.fillStyle) {
                            canvas.style.cursor = 'pointer'
                            canvas.title = 'Click to change color'
                        }
                    },
                    onLeave: (e, legendItem, legend) => {
                        const canvas = legend.chart.canvas
                        canvas.style.cursor = 'default'
                        canvas.title = ''
                    },
                    onClick: (e, legendItem, _legend) => {
                        const index = legendItem.datasetIndex ?? 0
                        setColorPickerState({
                            open: !colorPickerState.open,
                            index,
                            color: chartData.datasets[index].borderColor as string,
                        })
                    },
                    labels: {
                        usePointStyle: true,
                    },
                },
            },
        }
    }, [
        startDate,
        endDate,
        currentZoom?.xMin,
        currentZoom?.xMax,
        theme,
        sensors,
        chartData.datasets,
        setHoveredPoint,
        colorPickerState.open,
        dateTimeFormatter,
    ])

    function handleColorChange(newColor: string) {
        const updatedDatasets = [...chartData.datasets]
        updatedDatasets[colorPickerState.index].borderColor = newColor
        updatedDatasets[colorPickerState.index].backgroundColor = newColor
        setChartData((prevData) => ({ ...prevData, datasets: updatedDatasets }))
    }

    function handlePngDownloadClick() {
        if (chartRef.current) {
            const imageString = chartRef.current.canvas.toDataURL(
                'image/png',
                1.0,
            )
            const link = document.createElement('a')
            link.href = imageString
            link.download = 'chart.png'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        }
    }

    function handleCsvDownloadClick() {
        const allTimestamps = Array.from(
            new Set(
                chartData.datasets.flatMap((ds: any) =>
                    ds.data.map((p: any) => new Date(p.x).getTime()),
                ),
            ),
        ).sort((a, b) => a - b)

        let csvContent = 'timestamp,deviceId,sensorId,value,unit,phenomena\n'

        allTimestamps.forEach((timestamp) => {
            const isoTime = new Date(timestamp).toISOString()

            sensors.forEach((sensor: any) => {
                const point = sensor.data.find(
                    (d: any) => new Date(d.time).getTime() === timestamp,
                )

                if (point) {
                    csvContent += `${isoTime},`
                    csvContent += `${sensor.deviceId || ''},`
                    csvContent += `${sensor.id || ''},`
                    csvContent += `${point.value ?? ''},`
                    csvContent += `${sensor.unit || ''},`
                    csvContent += `${sensor.title || ''}\n`
                }
            })
        })

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        link.href = url
        link.download = 'chart_data.csv'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    function handleResetZoomClick() {
        if (chartRef.current) {
            chartRef.current.resetZoom()
            setCurrentZoom(null)
        }
    }

    function handleDrag(_e: any, data: DraggableData) {
        setOffsetPositionX(data.x)
        setOffsetPositionY(data.y)
    }

    const hasNoData = sensors.every(
        (sensor) => !sensor.data || sensor.data.length === 0,
    )

    return (
        <>
            <Draggable
                nodeRef={nodeRef as RefObject<HTMLDivElement>}
                bounds="#osem"
                handle="#graphTop"
                defaultPosition={{ x: offsetPositionX, y: offsetPositionY }}
                onDrag={handleDrag}
                disabled={!isBrowser && !isTablet}
            >
                <div
                    ref={nodeRef}
                    className="absolute top-14 right-4 bottom-6 left-4 z-40 flex flex-col gap-2 rounded-xl bg-white px-4 pt-2 text-sm font-medium text-zinc-800 shadow-lg ring-1 shadow-zinc-800/5 ring-zinc-900/5 md:top-auto md:right-4 md:bottom-7.5 md:left-auto md:h-[35%] md:max-h-[35%] md:w-[60vw] dark:bg-zinc-800 dark:text-zinc-200 dark:opacity-95 dark:ring-white dark:backdrop-blur-xs"
                >
                    {navigation.state === 'loading' && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-100/30 backdrop-blur-[1.5px]">
                            <Spinner />
                        </div>
                    )}
                    <div
                        className="flex cursor-move flex-wrap items-center justify-between gap-2 px-2 pt-2"
                        id="graphTop"
                    >
                        <div className="flex grow flex-wrap items-center gap-2">
                            <DateRangeFilter />
                            <AggregationFilter />

                            {canMerge && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleMergeAxes}
                                    className="border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                    title="Beide Achsen teilen dieselbe Einheit. Zusammenlegen, um Platz für weitere Sensoren zu machen."
                                >
                                    {t('merge_axes', 'Achsen zusammenlegen')} (
                                    {axisUnits['1']})
                                </Button>
                            )}
                        </div>
                        <div className="ml-auto flex items-center justify-end gap-4">
                            {currentZoom !== null &&
                                currentZoom.xMax !== 0 &&
                                currentZoom.xMin !== 0 && (
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <RefreshCcw
                                                    onClick={handleResetZoomClick}
                                                    className="cursor-pointer"
                                                />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p>{t('reset_zoom')}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                )}
                            <DropdownMenu>
                                <DropdownMenuTrigger>
                                    <Download />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                    <DropdownMenuItem
                                        onClick={handlePngDownloadClick}
                                    >
                                        PNG
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={handleCsvDownloadClick}
                                    >
                                        CSV
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            <X
                                className="cursor-pointer"
                                onClick={() => {
                                    searchParams.delete('date_to')
                                    searchParams.delete('date_from')
                                    searchParams.delete('aggregation')
                                    setSearchParams(searchParams)
                                    void navigate({
                                        pathname: `/explore/${sensors[0].deviceId}`,
                                        search: searchParams.toString(),
                                    })
                                }}
                            />
                        </div>
                    </div>
                    <div className="flex min-h-0 w-full flex-1 items-center justify-center">
                        {hasNoData ? (
                            <div>{t('no_data_in_range')}</div>
                        ) : (
                            <ClientOnly fallback={<Spinner />}>
                                {() => (
                                    <GraphWithZoom
                                        chartData={chartData}
                                        options={options}
                                        chartRef={chartRef}
                                    />
                                )}
                            </ClientOnly>
                        )}
                    </div>

                    {colorPickerState.open && (
                        <>
                            <div className="absolute inset-0 z-50 bg-black opacity-50"></div>
                            <div
                                className="absolute z-50 rounded bg-white dark:bg-zinc-800"
                                style={{
                                    left: '50%',
                                    top: '50%',
                                    transform: 'translate(-50%, -50%)',
                                }}
                            >
                                <ColorPicker
                                    handleColorChange={handleColorChange}
                                    colorPickerState={colorPickerState}
                                    setColorPickerState={setColorPickerState}
                                />
                            </div>
                        </>
                    )}
                </div>
            </Draggable>
        </>
    )
}