import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Trash2, Download, RefreshCw, AlertCircle } from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  houseNumber: string;
  street: string;
  notes: string;
  navigator?: 'google' | 'waze' | null;
  timestamp: number;
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const fullTranscriptRef = useRef('');

  // Carga inicial ultra-segura
  useEffect(() => {
    console.log("App initializing...");
    try {
      const saved = localStorage.getItem('deliveryOrders');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setOrders(parsed.sort((a, b) => b.timestamp - a.timestamp));
        }
      }
    } catch (e) {
      console.error("Failed to load orders", e);
    }
    setIsLoaded(true);

    // Configuración de PWA
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Configuración de Voz
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        // Cambiamos a continuous: false para evitar errores de duplicación en Android
        // Reiniciaremos la escucha manualmente si es necesario
        recognition.continuous = false; 
        recognition.lang = 'es-ES';
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              final += transcript;
            } else {
              interim += transcript;
            }
          }
          
          if (final) {
            // Filtro para evitar que palabras idénticas se peguen (ej: "casa casa")
            const lastWords = fullTranscriptRef.current.trim().split(' ');
            const newWords = final.trim().split(' ');
            
            if (lastWords[lastWords.length - 1].toLowerCase() !== newWords[0].toLowerCase()) {
              fullTranscriptRef.current += ' ' + final;
            } else {
              // Si la primera palabra nueva es igual a la última vieja, solo añadimos el resto
              fullTranscriptRef.current += ' ' + newWords.slice(1).join(' ');
            }
          }

          const displayValue = (fullTranscriptRef.current + ' ' + interim).trim();
          setTranscriptPreview(displayValue);
          
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (recognitionRef.current) {
              recognitionRef.current.stop();
            }
          }, 2500); 
        };

        recognition.onstart = () => {
          setIsListening(true);
          setError(null);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech Error", event.error);
          if (event.error === 'not-allowed') setError("Permiso de micro denegado");
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
          if (fullTranscriptRef.current.trim()) {
            processVoiceInput(fullTranscriptRef.current);
            fullTranscriptRef.current = '';
            setTranscriptPreview('');
          }
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        };
        recognitionRef.current = recognition;
      } catch (e) {
        console.error("Failed to init speech", e);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  // Guardado automático
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('deliveryOrders', JSON.stringify(orders));
    }
  }, [orders, isLoaded]);

  const processVoiceInput = (text: string) => {
    // Limpiamos el texto de ruidos comunes y duplicados raros como "P8P8"
    let cleanText = text.toLowerCase().trim()
      .replace(/([a-z0-9]+)\1+/gi, '$1') // Quita repeticiones inmediatas de caracteres
      .replace(/\s+/g, ' ');

    // Intentar detectar el número de pedido
    // Ahora acepta "p8", "p 8", "pedido 8", "orden 8" o un número al inicio
    let orderNumber = cleanText.match(/(?:pedido|orden|p)\s*(\d+)/)?.[1];
    if (!orderNumber) {
      const firstNum = cleanText.match(/^\d+/);
      if (firstNum) orderNumber = firstNum[0];
    }

    // Intentar detectar el número de casa
    let houseNumber = cleanText.match(/(?:casa|número|numero|nº|no|n)\s*(\d+)/)?.[1];
    if (!houseNumber) {
      // Si hay un número al final de la frase
      const lastNum = cleanText.match(/\s(\d+)$/);
      if (lastNum) houseNumber = lastNum[0].trim();
    }

    // Intentar detectar la calle
    let street = cleanText.match(/(?:calle|avenida|av|pje|pasaje)\s+([a-z0-9\s]+?)(?=\s+(?:casa|pedido|nota|orden|número|numero|p\d|$))/i)?.[1];
    
    if (!street) {
      // Si no hay palabra "calle", buscamos texto entre números
      const words = cleanText.split(' ');
      const streetWords = words.filter(w => !w.match(/^\d+$/) && !['pedido', 'orden', 'casa', 'numero', 'p'].includes(w));
      if (streetWords.length > 0) {
        street = streetWords.join(' ');
      }
    }

    const navMatch = cleanText.includes('waze') ? 'waze' : cleanText.includes('google') || cleanText.includes('maps') ? 'google' : null;
    const noteParts = cleanText.split(/nota\s+/i);

    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 9),
      orderNumber: orderNumber || 'S/N',
      houseNumber: houseNumber || 'S/N',
      street: street?.trim() || 'Calle no detectada',
      notes: noteParts.length > 1 ? noteParts[1].trim() : '',
      navigator: navMatch,
      timestamp: Date.now()
    };

    setOrders(prev => [newOrder, ...prev].slice(0, 5));
    
    // Vibración para Android
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError("Tu navegador no soporta voz");
      return;
    }
    
    if (isListening) {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      recognitionRef.current.stop();
    } else {
      try {
        setError(null);
        recognitionRef.current.start();
      } catch (e) {
        console.error("Start error", e);
        // Si ya está corriendo, no hacemos nada
      }
    }
  };

  const openMaps = (type: 'google' | 'waze') => {
    const url = type === 'google' 
      ? 'https://maps.google.com'
      : 'waze://';
    
    // Intentar abrir la app directamente con el esquema waze://
    // Si falla (por ejemplo en PC), usamos el fallback de web
    if (type === 'waze') {
      window.location.href = url;
      // Fallback por si no tiene la app instalada o está en PC
      setTimeout(() => {
        if (document.hasFocus()) {
          window.open('https://www.waze.com/ul', '_blank');
        }
      }, 500);
    } else {
      window.open(url, '_blank');
    }
  };

  const setNavigator = (id: string, nav: 'google' | 'waze' | null) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, navigator: o.navigator === nav ? null : nav } : o));
    if ('vibrate' in navigator) navigator.vibrate(30);
  };

  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  const hardReset = () => {
    localStorage.clear();
    window.location.reload();
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={48} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 pt-2">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white uppercase">Delivery Notes</h1>
          <p className="text-[10px] text-zinc-500 uppercase tracking-[0.2em] font-bold">Voz a Texto • Offline</p>
        </div>
        <button 
          onClick={hardReset}
          className="p-2 text-zinc-700 hover:text-red-500 transition-colors"
          title="Reiniciar todo"
        >
          <RefreshCw size={18} />
        </button>
      </header>

      {/* Install Prompt */}
      {deferredPrompt && (
        <div className="mb-6 bg-emerald-500 p-4 rounded-2xl flex items-center justify-between shadow-lg shadow-emerald-500/20 border border-emerald-400/30">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-xl">
              <Download size={20} className="text-white" />
            </div>
            <div>
              <p className="font-bold text-sm leading-tight">Instalar Aplicación</p>
              <p className="text-[10px] opacity-80">Acceso rápido sin navegador</p>
            </div>
          </div>
          <button 
            onClick={() => {
              deferredPrompt.prompt();
              deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
            }}
            className="bg-white text-emerald-600 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm active:scale-95 transition-transform"
          >
            Instalar
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/50 p-3 rounded-xl flex items-center gap-3 text-red-400 text-xs">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Main Action Button */}
      <div className="relative mb-10">
        <button 
          onClick={toggleListening}
          className={`w-full aspect-square max-h-[200px] rounded-[40px] flex flex-col items-center justify-center gap-4 transition-all duration-500 relative z-10 ${
            isListening 
            ? 'bg-red-500 shadow-[0_0_50px_rgba(239,68,68,0.3)] scale-95' 
            : 'bg-zinc-900 border border-zinc-800 shadow-xl'
          }`}
        >
          <div className={`p-6 rounded-full transition-colors ${isListening ? 'bg-white text-red-500' : 'bg-emerald-500 text-white'}`}>
            {isListening ? <MicOff size={48} strokeWidth={2.5} /> : <Mic size={48} strokeWidth={2.5} />}
          </div>
          <span className={`font-black uppercase tracking-widest text-sm ${isListening ? 'text-white' : 'text-zinc-400'}`}>
            {isListening ? 'Escuchando...' : 'Dictar Pedido'}
          </span>
        </button>
        
        {/* Pulse Effect */}
        {isListening && (
          <div className="absolute inset-0 bg-red-500/20 rounded-[40px] animate-ping opacity-20" />
        )}
      </div>

      {/* Transcript Preview */}
      {isListening && (
        <div className="mb-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300 min-h-[60px]">
          <p className="text-zinc-500 text-[10px] uppercase font-black tracking-[0.2em] mb-3">Escuchando ahora...</p>
          <div className="bg-zinc-900/80 backdrop-blur-sm p-4 rounded-2xl border border-emerald-500/20 shadow-xl">
            <p className="text-lg font-bold text-emerald-400 leading-tight">
              {transcriptPreview || 'Empieza a hablar...'}
            </p>
          </div>
        </div>
      )}

      {/* Orders List */}
      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-xs font-black uppercase tracking-widest text-zinc-500">Pedidos Recientes</h2>
          <span className="text-[10px] bg-zinc-900 px-2 py-1 rounded-md text-zinc-600 font-mono">{orders.length}/5</span>
        </div>

        <div className="space-y-3">
          {orders.map((order) => (
            <div 
              key={order.id} 
              className={`bg-zinc-900/50 border p-4 rounded-3xl flex items-center justify-between group transition-all duration-500 animate-in fade-in zoom-in ${
                order.navigator === 'google' ? 'border-blue-500/30 bg-blue-500/5' : 
                order.navigator === 'waze' ? 'border-cyan-400/30 bg-cyan-400/5' : 
                'border-zinc-900'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-zinc-600 tracking-tighter">Pedido</span>
                      <span className="text-xl font-black text-white leading-none">#{order.orderNumber}</span>
                    </div>
                    <div className="w-px h-8 bg-zinc-800" />
                    <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-bold text-zinc-600 tracking-tighter">Casa</span>
                      <span className="text-xl font-black text-emerald-500 leading-none">{order.houseNumber}</span>
                    </div>
                  </div>

                  {/* Logo de Navegador Grande (Clicable para cambiar de app) */}
                  {order.navigator && (
                    <button 
                      onClick={() => openMaps(order.navigator!)}
                      className={`p-2 rounded-2xl animate-in zoom-in duration-500 transition-transform active:scale-95 ${
                        order.navigator === 'google' ? 'bg-blue-500/20 ring-1 ring-blue-500/50' : 'bg-cyan-400/20 ring-1 ring-cyan-400/50'
                      }`}
                      title={`Cambiar a ${order.navigator}`}
                    >
                      <img 
                        src={order.navigator === 'google' 
                          ? "https://www.google.com/images/branding/product/ico/maps15_24dp.ico" 
                          : "https://waze.com/favicon.ico"
                        } 
                        className="w-8 h-8 object-contain" 
                        alt={order.navigator} 
                      />
                    </button>
                  )}
                </div>

                {order.street && (
                  <div className="flex items-center gap-2 mb-3 bg-zinc-950/50 p-2 rounded-xl border border-zinc-800/50">
                    <span className="text-[9px] uppercase font-bold text-zinc-600 tracking-tighter">Calle:</span>
                    <span className="text-sm font-bold text-zinc-200 truncate">{order.street}</span>
                  </div>
                )}
                
                {/* Selector de Navegador */}
                <div className="flex gap-2">
                  <button 
                    onClick={() => setNavigator(order.id, 'google')}
                    className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      order.navigator === 'google' 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/40 scale-[1.02]' 
                      : 'bg-zinc-800 text-zinc-500 opacity-40 grayscale'
                    }`}
                  >
                    <img src="https://www.google.com/images/branding/product/ico/maps15_24dp.ico" className="w-3 h-3" alt="" />
                    Google
                  </button>
                  <button 
                    onClick={() => setNavigator(order.id, 'waze')}
                    className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                      order.navigator === 'waze' 
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/40 scale-[1.02]' 
                      : 'bg-zinc-800 text-zinc-500 opacity-40 grayscale'
                    }`}
                  >
                    <img src="https://waze.com/favicon.ico" className="w-3 h-3" alt="" />
                    Waze
                  </button>
                </div>

                {order.notes && (
                  <p className="text-xs text-zinc-400 italic mt-3 border-t border-zinc-800/50 pt-2">
                    {order.notes}
                  </p>
                )}
              </div>
              <button 
                onClick={() => removeOrder(order.id)}
                className="ml-4 p-3 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          {orders.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-zinc-900 rounded-[40px]">
              <p className="text-zinc-600 text-sm font-medium italic px-4">
                Di algo como:<br/>
                <span className="text-emerald-500/70">"Pedido 123 calle mayor casa 45 en Waze"</span>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Footer Info */}
      <footer className="mt-12 text-center pb-8">
        <p className="text-[9px] text-zinc-700 uppercase font-bold tracking-[0.3em]">Diseñado para Delivery • 2026</p>
      </footer>
    </div>
  );
}
