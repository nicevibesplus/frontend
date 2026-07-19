import { addDays } from 'date-fns'
import { redirect, useLoaderData } from 'react-router'
import { type Route } from './+types/explore.$deviceId.$sensorId.$axisId.$'
import Graph from '~/components/device-detail/graph'
import MobileBoxView from '~/components/map/layers/mobile/mobile-box-view'
import {
	categorizeIntoTrips,
	type LocationPoint,
} from '~/lib/mobile-box-helper'
import { type SensorWithMeasurementData } from '~/db/schema'

interface SensorWithColor extends SensorWithMeasurementData {
	color: string
	displayName: string
	axisId: string
	deviceId: string
}

async function processSensorMeasurements(
	tuple: { deviceId: string; sensorId: string; axisId: string },
	colorFallback: string,
	aggregation: string,
	startDate: string | null,
	endDate: string | null,
	isMultiDevice: boolean,
): Promise<SensorWithColor | null> {
	const { getDevice } = await import('~/db/models/device.server')
	const { getSensor } = await import('~/db/models/sensor.server')
	const { getMeasurement } =
		await import('~/db/models/measurement.query.server')

	const device = await getDevice({ id: tuple.deviceId })
	const sensor = await getSensor(tuple.sensorId)

	if (!device || !sensor) return null

	const dName = device.name || device.id
	const displayName = isMultiDevice
		? `${sensor.title} in ${sensor.unit} (${dName})`
		: `${sensor.title} in ${sensor.unit}`

	const rawData = await getMeasurement(
		tuple.sensorId,
		aggregation,
		startDate ? new Date(startDate) : undefined,
		endDate ? addDays(new Date(endDate), 1) : undefined,
	)

	let normalizedData = (rawData as any[]).map((d) => ({
		...d,
		locationId: d.locationId ? Number(d.locationId) : null,
		location: d.location ? { ...d.location, id: Number(d.location.id) } : null,
	}))

	if (device.exposure === 'mobile' && !startDate) {
		const dataPoints: LocationPoint[] = normalizedData
			.filter((d) => d.location !== null)
			.map((d) => ({
				geometry: { x: d.location!.x, y: d.location!.y },
				time: d.time.toISOString(),
			}))

		const trips = categorizeIntoTrips(dataPoints, 600)
		if (trips.length > 0) {
			normalizedData = normalizedData.filter((point) => {
				const pt = new Date(point.time).getTime()
				return (
					pt >= new Date(trips[0].startTime).getTime() &&
					pt <= new Date(trips[0].endTime).getTime()
				)
			})
		}
	}

	return {
		...sensor,
		data: normalizedData,
		color: colorFallback,
		displayName,
		axisId: tuple.axisId,
		deviceId: tuple.deviceId,
	} as SensorWithColor
}

export async function loader({ params, request }: Route.LoaderArgs) {

	const { deviceId, sensorId, axisId } = params
	const splat = params['*']

	if (!deviceId || !sensorId || !axisId) {
		return redirect('/explore')
	}

	const allTuples = [{ deviceId, sensorId, axisId }]
	if (splat) {
		const segments = splat.split('/').filter(Boolean)
		for (let i = 0; i < segments.length; i += 3) {
			if (segments[i] && segments[i + 1] && segments[i + 2]) {
				allTuples.push({
					deviceId: segments[i],
					sensorId: segments[i + 1],
					axisId: segments[i + 2],
				})
			}
		}
	}


	const url = new URL(request.url)
	const aggregation = url.searchParams.get('aggregation') || 'raw'
	const startDate = url.searchParams.get('date_from')
	const endDate = url.searchParams.get('date_to')

	const isMultiDevice = new Set(allTuples.map((t) => t.deviceId)).size > 1
	const colorPalette = [
		'#8da0cb',
		'#fc8d62',
		'#66c2a5',
		'#e78ac3',
		'#a6d854',
		'#ffd92f',
	]

	const processedSensors = await Promise.all(
		allTuples.map((tuple, index) =>
			processSensorMeasurements(
				tuple,
				colorPalette[index % colorPalette.length],
				aggregation,
				startDate,
				endDate,
				isMultiDevice,
			),
		),
	)

	const allSensors = processedSensors.filter(Boolean) as SensorWithColor[]

	const axisUnits: Record<string, string> = {}
	const finalSensors: SensorWithColor[] = []

	for (const sensor of allSensors) {
		if (!axisUnits[sensor.axisId]) {
			axisUnits[sensor.axisId] = sensor.unit || 'unknown'
			finalSensors.push(sensor)
		} else if (axisUnits[sensor.axisId] === sensor.unit) {
			finalSensors.push(sensor)
		} else {
		}
	}

	if (finalSensors.length === 0) {
		throw new Response('Sensors not found', { status: 404 })
	}

	const { getDevice } = await import('~/db/models/device.server')
	const primaryDevice = await getDevice({ id: deviceId })

	return {
		device: primaryDevice,
		sensors: finalSensors,
		startDate,
		endDate,
		aggregation,
	}
}

export default function SensorView() {
	const loaderData = useLoaderData<typeof loader>()

	return (
		<>
			<Graph
				aggregation={loaderData.aggregation}
				sensors={loaderData.sensors}
			/>
			{loaderData.device?.exposure === 'mobile' && (
				<MobileBoxView sensors={loaderData.sensors} />
			)}
		</>
	)
}
