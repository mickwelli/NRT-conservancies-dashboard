import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import Plot from 'react-plotly.js'; // <--- IMPORT THIS
import 'leaflet/dist/leaflet.css'; 
import './App.css'; 

const MAPTILER_API_KEY = import.meta.env.VITE_MAPTILER_API_KEY; 
const MAPTILER_URL = `https://api.maptiler.com/maps/hybrid/{z}/{x}/{y}.png?key=${MAPTILER_API_KEY}`;

// --- NEW COMPONENT: The Side Panel ---
const TAB_CONFIG = [
  { id: 'fc',   label: 'Fractional Cover', suffix: '_GroundCover' },
  { id: 'ndvi', label: 'NDVI',             suffix: '_NDVI' },
  { id: 'rain', label: 'Rainfall',             suffix: '_Rainfall' },
];

const SidePanel = ({ conservancyName, onClose }) => {
  // Default to the first tab in the config
  const [activeTabId, setActiveTabId] = useState(TAB_CONFIG[0].id);
  const [figure, setFigure] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!conservancyName) return;

    setLoading(true);
    setError(false);
    setFigure(null);

    // 1. Find the current tab config
    const currentTab = TAB_CONFIG.find(t => t.id === activeTabId);
    
    // 2. Construct path: public/figs/Naapu/Naapu_fc.json
    // NOTE: This assumes folder name and file prefix match conservancyName exactly
    const fileName = `${import.meta.env.BASE_URL}figs/${conservancyName}/${conservancyName}${currentTab.suffix}.json`;

    console.log(`Fetching: ${fileName}`);

    fetch(fileName)
      .then(res => {
        if (!res.ok) throw new Error("File not found");
        return res.json();
      })
      .then(data => {
        setFigure(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading plot:", err);
        setError(true);
        setLoading(false);
      });
  }, [conservancyName, activeTabId]); // Re-run when Name OR Tab changes

  return (
    <div className="side-panel">
      
      {/* Header with Close Button */}
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px'}}>
        <h2 style={{margin: 0}}>{conservancyName} Analytics</h2>
        <button onClick={onClose} style={{cursor: 'pointer', border: 'none', background: 'transparent', fontSize: '1.2rem'}}>✖</button>
      </div>

      {/* --- TABS --- */}
      <div className="panel-tabs">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTabId === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTabId(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ height: 'calc(100% - 100px)' }}> {/* Adjust height logic as needed */}
        
        {loading && <p style={{textAlign: 'center', marginTop: '20px'}}>Loading {activeTabId.toUpperCase()} data...</p>}
        
        {error && (
          <div style={{color: 'red', padding: '20px', textAlign: 'center'}}>
            <p>Data not found.</p>
            <small>Missing file for {TAB_CONFIG.find(t=>t.id===activeTabId).label}</small>
          </div>
        )}

        {figure && !loading && (
          <Plot
            data={figure.data}
            layout={{
              ...figure.layout,
              width: undefined,
              height: undefined,
              autosize: true,
              margin: { l: 50, r: 20, t: 30, b: 30 },
              legend: { orientation: "h", y: 1.1 } // Horizontal legend
            }}
            frames={figure.frames}
            config={{ responsive: true, displayModeBar: false }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        )}
      </div>
    </div>
  );
};

function App() {
  const [conservancyData, setConservancyData] = useState(null);
  const [conservancyList, setConservancyList] = useState([]); 
  const [selectedConservancy, setSelectedConservancy] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const geoJsonLayerRef = useRef(null);
  const mapRef = useRef(null);
  const selectedLayerRef = useRef(null); 
  const layerMapRef = useRef(new Map()); 

  // ... [Previous Highlight Styles Code remains same] ...
  const highlightStyle = {
    fillColor: "#00ccff", 
    color: "#0077cc",    
    weight: 4,
    opacity: 1,
    fillOpacity: 0.6
  };
  
  const conservancyStyle = {
    fillColor: "#ffcc00", 
    color: "#ff6600",     
    weight: 2,
    opacity: 0.8,
    fillOpacity: 0.4
  };

  // ... [Previous Fetching & Sorting Code remains same] ...
  useEffect(() => {
    fetch(import.meta.env.BASE_URL + '/NRT_Conservancies.geojson') 
      .then(response => {
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          return response.json();
      })
      .then(data => setConservancyData(data))
      .catch(error => console.error("Error fetching GeoJSON:", error));
  }, []); 

  useEffect(() => {
    if (!conservancyData || !conservancyData.features) {
      setConservancyList([]);
      return;
    }
    const names = conservancyData.features
      .map(f => f.properties && f.properties.NAME)
      .filter(Boolean)
      .filter((v, i, a) => a.indexOf(v) === i) 
      .sort((a,b) => a.localeCompare(b));
    setConservancyList(names);
  }, [conservancyData]);

  // ... [Previous Interaction Logic/Functions remain same] ...
  // (Keep your selectConservancyByName, handleSelectConservancy, onEachFeature, etc.)
  const normalizeName = (s) => (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");

  const selectConservancyByName = (name, updateState = false) => {
     if (updateState) setSelectedConservancy(name || "");
     
     if (!mapRef.current) return;

     if (selectedLayerRef.current) {
       try { selectedLayerRef.current.setStyle(conservancyStyle); } catch (_) {}
       try { if (selectedLayerRef.current.bringToBack) selectedLayerRef.current.bringToBack(); } catch (_) {}
       selectedLayerRef.current = null;
     }
     
     if (!name) return; // If cleared, just return

     let layer = layerMapRef.current.get(name);
     if (!layer) {
      const targetNorm = normalizeName(name);
      layer = layerMapRef.current.get(targetNorm);
     }

     if (layer) {
       selectedLayerRef.current = layer;
       try { if (layer.setStyle) layer.setStyle(highlightStyle); } catch(_) {}
       try { if (layer.bringToFront) layer.bringToFront(); } catch(_) {}
       
       if (layer.getBounds) {
         mapRef.current.fitBounds(layer.getBounds(), { padding: [20,20], maxZoom: 15 });
         // IMPORTANT: Invalidate size to handle map resizing if panel opens
         setTimeout(() => mapRef.current.invalidateSize(), 300);
       }
     }
   };

  const handleSelectConservancy = (e) => {
    const name = e && e.target ? e.target.value : e;
    setSelectedConservancy(name || "");
    if (mapReady && mapRef.current) {
      selectConservancyByName(name, false);
    }
  };

  useEffect(() => {
    if (!mapReady || !selectedConservancy) return;
    const timeout = setTimeout(() => {
      selectConservancyByName(selectedConservancy, false);
    }, 300);
    return () => clearTimeout(timeout);
  }, [selectedConservancy, mapReady, conservancyData]);

  const onEachFeature = (feature, layer) => {
    const name = feature.properties.NAME;
    if (name) {
       layerMapRef.current.set(name, layer);
       layerMapRef.current.set(normalizeName(name), layer);
    }
    layer.on({
       click: () => selectConservancyByName(name, true)
    });
  };

  // --- RENDER ---
  return (
    <div className="dashboard-container">
      <div className="title-block">
        {/* ... Logo and title ... */}
        <img src={import.meta.env.BASE_URL + "DE_Africa_Logo.jpg"} alt="Logo" className="title-logo" />
        <div className="title-text">Conservancy Analytics</div>
        <div className="title-controls">
          <select
            value={selectedConservancy}
            onChange={handleSelectConservancy}
            className="conservancy-select"
          >
            <option value="">-- Select conservancy --</option>
            {conservancyList.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* NEW LAYOUT CONTAINER */}
      <div className="dashboard-content">
        
        {/* MAP WRAPPER */}
        <div className="map-wrapper">
           <MapContainer 
             center={[0.61, 37.02]} 
             zoom={8} 
             className="map-component"
             whenCreated={mapInstance => { mapRef.current = mapInstance; setMapReady(true); }}
           >
             <TileLayer
               attribution='&copy; MapTiler'
               url={MAPTILER_URL}
             />
             {conservancyData && (
               <GeoJSON 
                 data={conservancyData} 
                 style={conservancyStyle}
                 onEachFeature={onEachFeature}
               />
             )}
           </MapContainer>
        </div>

        {/* CONDITIONAL SIDE PANEL */}
        {selectedConservancy && (
            <SidePanel 
                conservancyName={selectedConservancy} 
                onClose={() => {
                    setSelectedConservancy("");
                    if(selectedLayerRef.current) {
                        selectedLayerRef.current.setStyle(conservancyStyle);
                        selectedLayerRef.current = null;
                    }
                }}
            />
        )}

      </div>
    </div>
  );
}

export default App;