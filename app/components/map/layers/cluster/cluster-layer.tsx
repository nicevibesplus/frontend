import { useEffect, useRef } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { ClusterMarker } from './cluster-marker'

export function ClusterMarkerLayer() {
    // 1. Fetch the raw imperative maplibre engine reference
    const { current: map } = useMap()
    
    // Track active marker mutations to clear old ones when panning/zooming
    const activeMarkersRef = useRef<any[]>([])

    useEffect(() => {
        if (!map) return

        const updateMarkers = () => {
            // Clear prior rendered DOM markers from the map canvas
            activeMarkersRef.current.forEach((m) => m.remove())
            activeMarkersRef.current = []

            const sourceId = 'osem-devices'

            // Query only the features that are currently inside the screen view boundary
            const features = map.querySourceFeatures(sourceId, {
                filter: ['has', 'point_count'],
            })

            // Track unique IDs to avoid duplicate cluster painting
            const processedIds = new Set()

            features.forEach((feature) => {
                const clusterId = feature.properties?.cluster_id
                if (processedIds.has(clusterId)) return
                processedIds.add(clusterId)

                // 2. Invoke your vanilla JS function directly!
                const markerInstance = ClusterMarker({
                    clusterFeature: feature as any,
                    map: map.getMap(), // Extracts the base maplibregl instance
                    sourceId,
                })

                // Inject marker into the canvas layout
                markerInstance.addTo(map.getMap())
                activeMarkersRef.current.push(markerInstance)
            })
        }

        // Attach listeners so clusters update fluidly while interacting with the map
        map.on('render', updateMarkers)
        map.on('moveend', updateMarkers)

        return () => {
            map.off('render', updateMarkers)
            map.off('moveend', updateMarkers)
            activeMarkersRef.current.forEach((m) => m.remove())
        }
    }, [map])

    return null // This component acts entirely as a side-effect controller
}