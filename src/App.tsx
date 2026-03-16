import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Trash2, Download, RefreshCw, AlertCircle } from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  houseNumber: string;
  notes: string;
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
        recognition.continuous = true;
        recognition.lang = 'es-ES';
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
            else interim += event.results[i][0].transcript;
          }
          setTranscriptPreview(final || interim);
          if (final) {
            processVoiceInput(final);
            setTimeout(() => {
              setTranscriptPreview('');
              recognition.stop();
            }, 1000);
          }
        };

        recognition.onerror = (event: any) => {
          console.error("Speech Error", event.error);
          if (event.error === 'not-allowed') setError("Permiso de micro denegado");
          setIsListening(false);
        };

        recognition.onend = () => setIsListening(false);
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
    const lower = text.toLowerCase();
    const orderMatch = lower.match(/(?:pedido|orden)\s*(\d+)/);
    const houseMatch = lower.match(/(?:casa|número|numero)\s*(\d+)/);
    const noteParts = lower.split(/nota\s+/i);

    const newOrder: Order = {
      id: Math.random().toString(36).substr(2, 9),
      orderNumber: orderMatch ? orderMatch[1] : '?',
      houseNumber: houseMatch ? houseMatch[1] : '?',
      notes: noteParts.length > 1 ? noteParts[1].trim() : '',
      timestamp: Date.now()
    };

    setOrders(prev => [newOrder, ...prev].slice(0, 5));
  };

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError("Tu navegador no soporta voz");
      return;
    }
    setError(null);
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        setError("Error al abrir micro");
        setIsListening(false);
      }
    }
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
      {isListening && transcriptPreview && (
        <div className="mb-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
          <p className="text-zinc-500 text-xs uppercase font-bold tracking-widest mb-2">Detectando...</p>
          <p className="text-xl font-medium text-emerald-400 italic leading-tight">"{transcriptPreview}"</p>
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
              className="bg-zinc-900/50 border border-zinc-900 p-4 rounded-3xl flex items-center justify-between group hover:border-zinc-800 transition-colors animate-in fade-in zoom-in duration-300"
            >
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-1">
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
                {order.notes && (
                  <p className="text-xs text-zinc-400 italic mt-2 border-t border-zinc-800/50 pt-2">
                    {order.notes}
                  </p>
                )}
              </div>
              <button 
                onClick={() => removeOrder(order.id)}
                className="p-3 text-zinc-700 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all"
              >
                <Trash2 size={20} />
              </button>
            </div>
          ))}

          {orders.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-zinc-900 rounded-[40px]">
              <p className="text-zinc-600 text-sm font-medium italic">Di algo como:<br/>"Pedido 123 casa 45 nota sin cebolla"</p>
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
