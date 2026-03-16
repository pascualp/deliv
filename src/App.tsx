import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Trash2, Download } from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  houseNumber: string;
  notes: string;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const savedOrders = localStorage.getItem('deliveryOrders');
    if (savedOrders) {
      setOrders(JSON.parse(savedOrders));
    }

    // Escuchar el evento de instalación
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    });

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.lang = 'es-ES';
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        addOrderFromVoice(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('deliveryOrders', JSON.stringify(orders));
  }, [orders]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const addOrderFromVoice = (text: string) => {
    const lowerText = text.toLowerCase();
    
    const orderMatch = lowerText.match(/(?:pedido|orden)\s*(\d+)/);
    const houseMatch = lowerText.match(/(?:casa|número)\s*(\d+)/);
    const noteMatch = lowerText.split(/nota\s+/i);

    const newOrder: Order = {
      id: Date.now().toString(),
      orderNumber: orderMatch ? orderMatch[1] : '?',
      houseNumber: houseMatch ? houseMatch[1] : '?',
      notes: noteMatch.length > 1 ? noteMatch[1] : ''
    };

    setOrders(prev => [newOrder, ...prev].slice(0, 2));
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      recognitionRef.current?.start();
      setIsListening(true);
    }
  };

  const removeOrder = (id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white p-4 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-center">Delivery Quick Notes</h1>
      
      {deferredPrompt && (
        <div className="bg-blue-600 p-4 rounded-2xl flex flex-col gap-3 animate-pulse border-2 border-white/20">
          <div className="flex items-center gap-3">
            <Download size={28} className="text-white" />
            <div>
              <p className="font-bold text-lg">¡Instala la App!</p>
              <p className="text-sm opacity-90">Úsala sin navegador y más rápido.</p>
            </div>
          </div>
          <button 
            onClick={handleInstallClick}
            className="w-full py-3 bg-white text-blue-600 rounded-xl font-bold text-lg shadow-lg"
          >
            INSTALAR AHORA
          </button>
        </div>
      )}

      <button 
        onClick={toggleListening}
        className={`w-full py-8 rounded-2xl flex items-center justify-center gap-4 text-xl font-bold ${isListening ? 'bg-red-600' : 'bg-emerald-600'}`}
      >
        {isListening ? <MicOff size={40} /> : <Mic size={40} />}
        {isListening ? 'Escuchando...' : 'Dictar Nuevo Pedido'}
      </button>

      <div className="flex flex-col gap-4">
        {orders.map(order => (
          <div key={order.id} className="bg-zinc-800 p-4 rounded-xl flex justify-between items-start border-l-4 border-blue-500">
            <div>
              <div className="text-sm text-zinc-400">Pedido: <span className="text-white font-mono text-lg">{order.orderNumber}</span></div>
              <div className="text-sm text-zinc-400">Casa: <span className="text-white font-mono text-lg">{order.houseNumber}</span></div>
              {order.notes && <div className="text-sm text-zinc-300 mt-2 italic">"{order.notes}"</div>}
            </div>
            <button onClick={() => removeOrder(order.id)} className="text-zinc-500 hover:text-red-400"><Trash2 /></button>
          </div>
        ))}
        {orders.length === 0 && <p className="text-center text-zinc-500 italic">No hay pedidos guardados.</p>}
      </div>
    </div>
  );
}
