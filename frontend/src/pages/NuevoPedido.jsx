import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ShoppingBag, User, CheckCircle2, Pencil } from 'lucide-react';
import { dispatchPanelSync } from '../components/syncEvents';

const EMPTY_PAYMENT_BREAKDOWN = {
  efectivo: '',
  transferencia: '',
  debito: '',
  online: '',
};

export default function NuevoPedido({ orderToEdit, setOrderToEdit, setCurrentView }) {
  const { token, currentLocation } = useAuth();
  const [products, setProducts] = useState([]);
  
  // Client Form
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [orderType, setOrderType] = useState('Delivery');
  const [paymentMethod, setPaymentMethod] = useState('efectivo');
  const [paymentBreakdown, setPaymentBreakdown] = useState(EMPTY_PAYMENT_BREAKDOWN);
  const [clientMatches, setClientMatches] = useState([]);
  const [availableAddresses, setAvailableAddresses] = useState([]);

  // Cart
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!currentLocation?.id) {
      setProducts([]);
      return;
    }

    fetch(`/api/v1/yummy-installations/${currentLocation.id}/catalog`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setProducts((data.products || []).filter(p => p.active)))
      .catch(err => console.error(err));
  }, [token, currentLocation?.id]);

  useEffect(() => {
    if (orderToEdit) {
      const editPhone = orderToEdit.customer_phone || orderToEdit.phone || '';
      const editName = orderToEdit.customer_name || orderToEdit.client_name || '';
      const editAddress = orderToEdit.customer_address || orderToEdit.address || '';
      setPhone(editPhone);
      setName(editName);
      setAddress(editAddress);
      setOrderType(orderToEdit.order_type || 'Delivery');
      setPaymentMethod(orderToEdit.payment_method || 'efectivo');
      setPaymentBreakdown({
        efectivo: String(orderToEdit.payment_breakdown?.efectivo ?? ''),
        transferencia: String(orderToEdit.payment_breakdown?.transferencia ?? ''),
        debito: String(orderToEdit.payment_breakdown?.debito ?? ''),
        online: String(orderToEdit.payment_breakdown?.online ?? ''),
      });
      setAvailableAddresses(editAddress ? [{ client_id: orderToEdit.customer_id, address: editAddress }] : []);
      if (orderToEdit.items) {
        setCart(orderToEdit.items.map((item, idx) => ({
          ...item,
          customKey: item.customKey || `imported-${item.id || idx}-${idx}`,
          toppings: item.toppings || [],
          extras: item.extras || [],
          guarniciones: item.guarniciones || [],
          product_name: item.name || item.product_name,
        })));
      }
    } else {
      setCart([]); setPhone(''); setName(''); setAddress('');
      setPaymentBreakdown(EMPTY_PAYMENT_BREAKDOWN);
      setClientMatches([]);
      setAvailableAddresses([]);
      setEditingCartItemKey(null);
    }
  }, [orderToEdit]);

  const findClientByPhone = async (phoneValue) => {
    const cleanPhone = String(phoneValue || '').trim();
    if (!cleanPhone) return null;
    try {
      const params = new URLSearchParams();
      if (currentLocation?.id) {
        params.set('installation_id', currentLocation.id);
      }
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`/api/v1/data/clients/by-phone/${encodeURIComponent(cleanPhone)}${query}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.log("Cliente no encontrado, se creará uno nuevo");
    }
    return null;
  };

  const applyClientLookup = (data, preserveTypedFields = true) => {
    if (!data) return { name: '', address: '' };
    const matches = Array.isArray(data.matches) ? data.matches : [];
    const addresses = Array.isArray(data.addresses) ? data.addresses : [];
    setClientMatches(matches);
    setAvailableAddresses(addresses);

    const preferredName = matches.find((item) => String(item.name || '').trim())?.name || '';
    const preferredAddress = addresses[0]?.address || matches[0]?.address || '';

    if (!preserveTypedFields || !name.trim()) {
      if (preferredName) {
          setName(preferredName);
      }
    }

    if (!preserveTypedFields || !address.trim()) {
      if (preferredAddress) {
        setAddress(preferredAddress);
      }
    } else if (addresses.length > 1) {
      const stillExists = addresses.some((item) => item.address === address);
      if (!stillExists && preferredAddress) {
        setAddress(preferredAddress);
      }
    }

    return { name: preferredName, address: preferredAddress };
  };

  const handlePhoneBlur = async () => {
    if (!phone) return;
    const data = await findClientByPhone(phone);
    if (data) {
      applyClientLookup(data, true);
    } else {
      setClientMatches([]);
      setAvailableAddresses([]);
    }
  };

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productAddons, setProductAddons] = useState({ toppings: [], extras: [], guarniciones: [] });
  const [editingCartItemKey, setEditingCartItemKey] = useState(null);
  const [modalPortionType, setModalPortionType] = useState('completo');

  const normalizeText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();

  const productBaseName = (productOrName) =>
    String(typeof productOrName === 'string' ? productOrName : productOrName?.name || '')
      .replace(/^1\/2\s+/i, '')
      .trim();

  const productNumericId = (productOrItem) => {
    const externalId = Number(productOrItem?.external_id || 0);
    if (externalId > 0) {
      return externalId;
    }
    const directId = Number(productOrItem?.product_id || productOrItem?.id || 0);
    if (directId > 0) {
      return directId;
    }
    return 0;
  };

  const configuredProductName = (product, portionType) => {
    const baseName = productBaseName(product);
    return portionType === 'mitad' ? `1/2 ${baseName}` : baseName;
  };

  const configuredProductPrice = (product, portionType) => {
    if (portionType === 'mitad' && Number(product?.allows_half)) {
      return Number(product?.half_price || 0);
    }
    return Number(product?.price || 0);
  };

  const configuredStockFactor = (portionType) => (portionType === 'mitad' ? 0.5 : 1);

  const normalizeAddonEntry = (entry) => ({
    ...entry,
    id: Number(entry?.id || 0),
    qty: Math.max(Number(entry?.qty || entry?.quantity || 1), 1),
    price: Number(entry?.price || 0),
    name: String(entry?.name || '').trim(),
  });

  const normalizeAddonCollection = (items = []) =>
    (Array.isArray(items) ? items : [])
      .map(normalizeAddonEntry)
      .filter((entry) => entry.id > 0 || entry.name);

  const createCartItemKey = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  };

  const openCustomizer = (product) => {
    const hasAddons = (product.toppings && product.toppings.length > 0) ||
                      (product.extras && product.extras.length > 0) ||
                      (product.guarniciones && product.guarniciones.length > 0);
    const allowsHalf = Boolean(product?.allows_half);
    
    if (hasAddons || allowsHalf) {
      setSelectedProduct(product);
      setProductAddons({ toppings: [], extras: [], guarniciones: [] });
      setEditingCartItemKey(null);
      setModalPortionType('completo');
    } else {
      addToCart(product, [], [], [], 'completo');
    }
  };

  const editCartItem = (item) => {
    const product = products.find((entry) => productNumericId(entry) === Number(item.product_id))
      || products.find((entry) => normalizeText(entry.name) === normalizeText(item.product_name || item.name))
      || products.find((entry) => normalizeText(productBaseName(entry)) === normalizeText(productBaseName(item.product_name || item.name)));
    if (!product) {
      setErrorMsg('No encontré el producto original para editar este ítem.');
      return;
    }
    setSelectedProduct(product);
    setProductAddons({
      toppings: normalizeAddonCollection(item.toppings),
      extras: normalizeAddonCollection(item.extras),
      guarniciones: normalizeAddonCollection(item.guarniciones),
    });
    setEditingCartItemKey(item.customKey);
    setModalPortionType(String(item.portion_type || '').trim().toLowerCase() === 'mitad' ? 'mitad' : 'completo');
  };

  const handleAddonToggle = (category, addon) => {
    setProductAddons(prev => {
      const isSelected = prev[category].some(item => item.id === addon.id);
      if (isSelected) {
        return { ...prev, [category]: prev[category].filter(item => item.id !== addon.id) };
      } else {
        return { ...prev, [category]: [...prev[category], addon] };
      }
    });
  };

  const updateAddonQuantity = (category, addon, delta) => {
    setProductAddons(prev => {
      const currentList = prev[category];
      const existing = currentList.find(item => item.id === addon.id);
      
      if (existing) {
        const newQty = (existing.qty || 1) + delta;
        if (newQty <= 0) {
          return { ...prev, [category]: currentList.filter(item => item.id !== addon.id) };
        }
        return { 
          ...prev, 
          [category]: currentList.map(item => item.id === addon.id ? { ...item, qty: newQty } : item) 
        };
      } else if (delta > 0) {
        return { ...prev, [category]: [...currentList, { ...addon, qty: 1 }] };
      }
      return prev;
    });
  };

  const generateItemSignature = (productId, toppings, extras, guarniciones, portionType = 'completo') => {
    const topIds = normalizeAddonCollection(toppings).sort((a, b) => a.id - b.id).map((entry) => `T${entry.id}Q${entry.qty}`).join('-');
    const extIds = normalizeAddonCollection(extras).sort((a, b) => a.id - b.id).map((entry) => `E${entry.id}Q${entry.qty}`).join('-');
    const guaIds = normalizeAddonCollection(guarniciones).sort((a, b) => a.id - b.id).map((entry) => `G${entry.id}Q${entry.qty}`).join('-');
    return `${productId}|${portionType}|${topIds}|${extIds}|${guaIds}`;
  };

  const calculateAddonsPrice = (toppings, extras, guarniciones) => {
    const normalizedToppings = normalizeAddonCollection(toppings);
    const normalizedExtras = normalizeAddonCollection(extras);
    const normalizedGuarniciones = normalizeAddonCollection(guarniciones);
    let total = 0;
    normalizedToppings.forEach((entry) => { total += Number(entry.price || 0) * (entry.qty || 1); });
    normalizedExtras.forEach((entry) => { total += Number(entry.price || 0) * (entry.qty || 1); });
    normalizedGuarniciones.forEach((entry) => { total += Number(entry.price || 0) * (entry.qty || 1); });
    return total;
  };

  const formatAddonSummary = (items = [], multiplier = 1) =>
    normalizeAddonCollection(items)
      .map((entry) => {
        const effectiveQty = Math.max(Number(entry.qty || 1), 1) * Math.max(Number(multiplier || 1), 1);
        return `${effectiveQty > 1 ? `${effectiveQty}x ` : ''}${entry.name}`;
      })
      .join(', ');

  const buildCartItem = (
    product,
    toppings = [],
    extras = [],
    guarniciones = [],
    portionType = 'completo',
    overrides = {},
  ) => {
    const normalizedProductId = Number(overrides.product_id || productNumericId(product) || 0);
    const normalizedToppings = normalizeAddonCollection(toppings);
    const normalizedExtras = normalizeAddonCollection(extras);
    const normalizedGuarniciones = normalizeAddonCollection(guarniciones);
    const configuredName = configuredProductName(product, portionType);
    const configuredPrice = configuredProductPrice(product, portionType);
    const configuredFactor = configuredStockFactor(portionType);
    const addonsTotal = calculateAddonsPrice(normalizedToppings, normalizedExtras, normalizedGuarniciones);
    const signatureKey = generateItemSignature(
      normalizedProductId,
      normalizedToppings,
      normalizedExtras,
      normalizedGuarniciones,
      portionType,
    );

    return {
      product_id: normalizedProductId,
      product_name: configuredName,
      quantity: Math.max(Number(overrides.quantity || 1), 1),
      price: configuredPrice + addonsTotal,
      basePrice: configuredPrice,
      toppings: normalizedToppings,
      extras: normalizedExtras,
      guarniciones: normalizedGuarniciones,
      portion_type: portionType,
      stock_factor: configuredFactor,
      base_quantity: Math.max(Number(overrides.base_quantity || 1), 1),
      bundle_quantity: Math.max(Number(overrides.bundle_quantity || 1), 1),
      customKey: overrides.customKey || createCartItemKey(),
      signatureKey,
    };
  };

  const resolveCartItemProductId = (item) => {
    const directId = Number(item?.product_id || 0);
    if (directId > 0) {
      return directId;
    }

    const match = products.find((entry) => normalizeText(entry.name) === normalizeText(item?.product_name || item?.name))
      || products.find((entry) => normalizeText(productBaseName(entry)) === normalizeText(productBaseName(item?.product_name || item?.name)));

    return productNumericId(match);
  };

  const confirmCustomProduct = () => {
    if (editingCartItemKey) {
      const previousItem = cart.find((item) => item.customKey === editingCartItemKey);
      if (!previousItem) {
        setEditingCartItemKey(null);
        setSelectedProduct(null);
        return;
      }

      const nextItem = buildCartItem(
        selectedProduct,
        productAddons.toppings,
        productAddons.extras,
        productAddons.guarniciones,
        modalPortionType,
        {
          quantity: previousItem.quantity,
          base_quantity: previousItem.base_quantity || 1,
          bundle_quantity: previousItem.bundle_quantity || 1,
          customKey: previousItem.customKey,
          product_id: productNumericId(selectedProduct),
        },
      );

      setCart((prevCart) => prevCart.map((item) => (
        item.customKey === editingCartItemKey ? nextItem : item
      )));
    } else {
      addToCart(selectedProduct, productAddons.toppings, productAddons.extras, productAddons.guarniciones, modalPortionType);
    }
    setEditingCartItemKey(null);
    setSelectedProduct(null);
    setModalPortionType('completo');
  };

  const addToCart = (product, toppings = [], extras = [], guarniciones = [], portionType = 'completo') => {
    setCart((prevCart) => [
      ...prevCart,
      buildCartItem(product, toppings, extras, guarniciones, portionType, { product_id: productNumericId(product) }),
    ]);
  };

  const updateQuantity = (customKey, delta) => {
    setCart((prevCart) => prevCart.reduce((nextCart, item) => {
      if (item.customKey !== customKey) {
        nextCart.push(item);
        return nextCart;
      }

      const newQuantity = Number(item.quantity || 0) + delta;
      if (newQuantity > 0) {
        nextCart.push({ ...item, quantity: newQuantity });
      }
      return nextCart;
    }, []));
  };

  const removeFromCart = (customKey) => setCart((prevCart) => prevCart.filter((item) => item.customKey !== customKey));

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
  const mixedTotal = ['efectivo', 'transferencia', 'debito', 'online']
    .reduce((acc, key) => acc + (parseFloat(paymentBreakdown[key]) || 0), 0);
  const mixedRemaining = Number((total - mixedTotal).toFixed(2));

  const [forceDuplicate, setForceDuplicate] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');

  const updatePaymentBreakdownValue = (key, value) => {
    setPaymentBreakdown((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const submitOrder = async (overrideDuplicate = false) => {
    if (cart.length === 0) {
      setErrorMsg("Agrega al menos un producto al carrito");
      return;
    }
    if (!currentLocation?.id && !orderToEdit) {
      setErrorMsg("Selecciona un local antes de crear el pedido");
      return;
    }
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    setDuplicateWarning('');

    let resolvedName = name.trim();
    let resolvedAddress = address.trim();
    const resolvedPhone = phone.trim();
    if (resolvedPhone && (!resolvedName || !resolvedAddress)) {
      const lookup = applyClientLookup(await findClientByPhone(resolvedPhone), true);
      resolvedName = resolvedName || lookup.name || '';
      resolvedAddress = resolvedAddress || lookup.address || '';
    }
    const customerName = resolvedName || (resolvedPhone ? `Cliente ${resolvedPhone}` : (orderType === 'Mostrador' ? 'MOSTRADOR' : ''));

    const payload = {
      customer_name: customerName,
      client_name: customerName,
      customer_phone: resolvedPhone,
      phone: resolvedPhone,
      customer_address: resolvedAddress,
      address: resolvedAddress,
      order_type: orderType,
      payment_method: paymentMethod,
      allow_duplicate: overrideDuplicate,
      items: cart.map(item => ({
        product_id: resolveCartItemProductId(item),
        product_name: item.product_name,
        quantity: item.quantity,
        base_quantity: item.base_quantity || item.quantity || 1,
        bundle_quantity: item.bundle_quantity || 1,
        stock_factor: item.stock_factor || 1,
        portion_type: item.portion_type || 'completo',
        price: item.price - calculateAddonsPrice(item.toppings || [], item.extras || [], item.guarniciones || []),
        toppings: (item.toppings || []).map(t => ({...t, quantity: t.qty || 1})),
        extras: (item.extras || []).map(e => ({...e, quantity: e.qty || 1})),
        guarniciones: (item.guarniciones || []).map(g => ({...g, quantity: g.qty || 1}))
      }))
    };

    const invalidItem = payload.items.find((item) => Number(item.product_id || 0) <= 0);
    if (invalidItem) {
      setLoading(false);
      setErrorMsg(`Producto inválido: no pude resolver el producto "${invalidItem.product_name}".`);
      return;
    }

    if (paymentMethod === 'mixto') {
        const breakdown = {
          efectivo: parseFloat(paymentBreakdown.efectivo) || 0,
          transferencia: parseFloat(paymentBreakdown.transferencia) || 0,
          debito: parseFloat(paymentBreakdown.debito) || 0,
          online: parseFloat(paymentBreakdown.online) || 0,
        };
        const breakdownTotal = Object.values(breakdown).reduce((acc, value) => acc + value, 0);
        if (Math.abs(breakdownTotal - total) > 0.01) {
          setLoading(false);
          setErrorMsg(`El pago mixto debe sumar exactamente $${total.toLocaleString()}`);
          return;
        }
        payload.payment_breakdown = breakdown;
    }

    try {
      const isEdit = !!orderToEdit;
      const installationQuery = currentLocation?.id ? `?installation_id=${encodeURIComponent(currentLocation.id)}` : '';
      const url = isEdit
        ? `/api/v1/data/pedidos/${orderToEdit.id}${installationQuery}`
        : `/api/v1/remote-actions/installations/${currentLocation.id}/create-order`;
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok) {
        const createMessage = data?.queued
          ? (data?.message || '¡Pedido en cola! Se enviará cuando el local vuelva a estar online.')
          : "¡Pedido enviado al conector para ejecución!";
        setSuccessMsg(isEdit ? "¡Pedido actualizado con éxito!" : createMessage);
        dispatchPanelSync({ modules: ['orders', 'kitchen', 'dashboard', 'cash'] });
        setCart([]);
        setPhone('');
        setName('');
        setAddress('');
        setPaymentBreakdown(EMPTY_PAYMENT_BREAKDOWN);
        setClientMatches([]);
        setAvailableAddresses([]);
        setEditingCartItemKey(null);
        setForceDuplicate(false);
        if (isEdit) {
          setTimeout(() => {
            setOrderToEdit(null);
            setCurrentView('gestion_pedidos');
          }, 1500);
        }
      } else if (res.status === 409 && !overrideDuplicate) {
        setDuplicateWarning(data.detail?.message || data.detail || "Ya existe un pedido activo para este cliente.");
      } else {
        let errMsg = "Error al crear pedido";
        if (data.detail) {
           if (typeof data.detail === 'string') {
               errMsg = data.detail;
           } else if (data.detail.message) {
               errMsg = data.detail.message;
           } else if (data.detail.detail) {
               errMsg = data.detail.detail;
           } else {
               errMsg = JSON.stringify(data.detail);
           }
        }
        setErrorMsg(errMsg);
      }
    } catch (e) {
      setErrorMsg("Fallo de conexión");
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } }
  };
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 min-h-[calc(100vh-120px)]">
      {/* Catálogo de Productos */}
      <div className="flex-1 flex flex-col bg-gray-900 rounded-2xl border border-gray-800/50 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-96 bg-blue-500/10 blur-[120px] pointer-events-none rounded-full"></div>
        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-xl z-10 flex justify-between items-center">
          <div className="flex items-center">
            <ShoppingBag className="w-5 h-5 text-blue-400 mr-2" />
            <h2 className="text-xl font-bold text-white tracking-wide">Catálogo Rápido</h2>
          </div>
          <div className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-gray-800 text-gray-400 border-gray-700">
            Catálogo central
          </div>
        </div>
        <div className="p-5 overflow-y-auto flex-1 z-10 custom-scrollbar">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
          >
            {products.map((p) => (
              <motion.button 
                variants={itemVariants}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                key={p.id}
                onClick={() => openCustomizer(p)}
                className="group relative bg-gray-800/40 backdrop-blur-md border p-5 rounded-2xl flex flex-col items-center justify-center text-center transition-all overflow-hidden border-gray-700/50 hover:bg-gray-800/80 hover:border-blue-500/50"
              >
                <div className="absolute inset-0 bg-gradient-to-t from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/10 group-hover:to-transparent transition-all"></div>
                
                <span className="font-bold text-white mb-2 relative z-10 drop-shadow-md">{p.name}</span>
                <span className="text-emerald-400 font-bold relative z-10 bg-emerald-500/10 px-3 py-1 rounded-full text-sm">${p.price.toLocaleString()}</span>
              </motion.button>
            ))}
          </motion.div>
        </div>
      </div>
      
      {/* Panel Lateral del Pedido */}
      <div className="w-full xl:w-[420px] xl:max-w-[420px] flex flex-col bg-gray-900/90 backdrop-blur-xl rounded-2xl border border-gray-800/50 overflow-hidden shrink-0 shadow-2xl relative">
        <div className="p-5 border-b border-gray-800/80 bg-gray-900/50 backdrop-blur-xl z-10">
          <div className="flex items-center mb-4">
            <User className="w-5 h-5 text-emerald-400 mr-2" />
            <h2 className="text-xl font-bold text-white tracking-wide">Nuevo Pedido</h2>
          </div>
          
          <div className="space-y-3 relative z-10">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Teléfono</label>
                <input 
                  type="text" 
                  value={phone} 
                  onChange={(e) => setPhone(e.target.value)} 
                  onBlur={handlePhoneBlur}
                  className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
                  placeholder="1122334455"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Nombre</label>
                <input 
                  type="text" 
                  value={name} 
                  onChange={(e) => setName(e.target.value)} 
                  className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
                  placeholder="Ej. Juan P."
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Dirección</label>
              {availableAddresses.length > 1 && (
                <select
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-gray-800 border border-blue-500/30 rounded-xl p-2.5 text-white mt-1 mb-2 text-sm outline-none focus:border-blue-500/60 transition-colors"
                >
                  {availableAddresses.map((item, index) => (
                    <option key={`${item.client_id || 'address'}-${index}`} value={item.address}>
                      {item.address}
                    </option>
                  ))}
                </select>
              )}
              <input 
                type="text" 
                value={address} 
                onChange={(e) => setAddress(e.target.value)} 
                className="w-full bg-gray-950/50 border border-gray-700/50 focus:border-blue-500/50 rounded-xl p-2.5 text-white mt-1 text-sm outline-none transition-colors"
              />
              {availableAddresses.length > 1 && (
                <p className="text-[11px] text-blue-300 mt-2">
                  Se encontraron {availableAddresses.length} domicilios para este contacto.
                </p>
              )}
            </div>
            
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white text-sm outline-none focus:border-blue-500/50 transition-colors">
                <option value="Delivery">Delivery</option>
                <option value="Mostrador">Mostrador</option>
                <option value="Lo busca">Retiro</option>
              </select>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-2.5 text-white text-sm outline-none focus:border-blue-500/50 transition-colors">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="online">Online</option>
                <option value="debito">Débito</option>
                <option value="mixto">Mixto</option>
              </select>
            </div>
            {paymentMethod === 'mixto' && (
              <div className="bg-gray-950/40 border border-gray-800/70 rounded-2xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Desglose de pago</label>
                  <span className={`text-xs font-bold ${mixedRemaining === 0 ? 'text-emerald-400' : 'text-orange-400'}`}>
                    Restante: ${mixedRemaining.toLocaleString()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['efectivo', 'Efectivo'],
                    ['transferencia', 'Transferencia'],
                    ['debito', 'Débito'],
                    ['online', 'Online'],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{label}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={paymentBreakdown[key]}
                        onChange={(e) => updatePaymentBreakdownValue(key, e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl p-2.5 text-white mt-1 text-sm outline-none focus:border-blue-500/50 transition-colors"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Ticket Animado */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-950/50 custom-scrollbar relative">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-50">
              <ShoppingBag className="w-12 h-12 text-gray-600 mb-3" />
              <p className="text-gray-500 text-sm font-medium tracking-wide">Tu ticket está vacío</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {cart.map(item => (
                  <motion.div 
                    layout
                    initial={{ opacity: 0, x: -20, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    key={item.customKey} 
                    className="flex flex-col sm:flex-row justify-between items-start gap-3 bg-gray-900 p-4 rounded-2xl border border-gray-800 shadow-sm"
                  >
                    <div className="flex-1">
                      <p className="font-bold text-gray-100 text-lg">{item.product_name}</p>
                      {item.toppings.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-500"></span> {formatAddonSummary(item.toppings, item.quantity)}</p>}
                      {item.extras.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-blue-500"></span> {formatAddonSummary(item.extras, item.quantity)}</p>}
                      {item.guarniciones.length > 0 && <p className="text-xs text-gray-400 mt-1 flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-orange-500"></span> {formatAddonSummary(item.guarniciones, item.quantity)}</p>}
                      <p className="text-sm font-black text-emerald-400 mt-2">${item.price.toLocaleString()}</p>
                    </div>
                    <div className="flex w-full sm:w-auto flex-row sm:flex-col items-center sm:items-end justify-between gap-3 sm:ml-2">
                      <div className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
                        <button onClick={() => updateQuantity(item.customKey, -1)} className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition-colors hover:text-white">-</button>
                        <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.customKey, 1)} className="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center hover:bg-gray-700 transition-colors hover:text-white">+</button>
                      </div>
                      <div className="flex items-center gap-3">
                        <button onClick={() => editCartItem(item)} className="text-xs text-blue-400/80 hover:text-blue-300 font-medium transition-colors flex items-center group">
                          <Pencil className="w-3.5 h-3.5 mr-1 group-hover:scale-110 transition-transform" /> Editar
                        </button>
                        <button onClick={() => removeFromCart(item.customKey)} className="text-xs text-red-500/70 hover:text-red-400 font-medium transition-colors flex items-center group">
                          <Trash2 className="w-3.5 h-3.5 mr-1 group-hover:scale-110 transition-transform" /> Quitar
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Totales y Botón de Cobro */}
        <div className="p-5 border-t border-gray-800 bg-gray-900/80 backdrop-blur-md z-10 shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex justify-between items-center mb-4">
            <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Total</span>
            <span className="text-3xl font-black text-emerald-400 drop-shadow-md">${total.toLocaleString()}</span>
          </div>

          {errorMsg && <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-3 text-sm font-medium text-center">{errorMsg}</div>}
          {successMsg && <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl mb-3 text-sm font-medium text-center">{successMsg}</div>}
          {duplicateWarning && (
            <div className="bg-orange-500/10 border border-orange-500/20 p-3 rounded-xl mb-3 text-center">
              <p className="text-orange-400 text-sm font-medium mb-2">{duplicateWarning}</p>
              <div className="flex gap-2">
                <button onClick={() => setDuplicateWarning('')} className="flex-1 bg-gray-800 text-gray-300 text-xs py-2 rounded-lg hover:bg-gray-700 font-bold">Cancelar</button>
                <button onClick={() => submitOrder(true)} className="flex-1 bg-orange-500 text-black text-xs py-2 rounded-lg hover:bg-orange-400 font-bold">Forzar Creación</button>
              </div>
            </div>
          )}

          {!duplicateWarning && (
            <div className="flex flex-col gap-2">
              <motion.button 
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading || cart.length === 0}
                onClick={() => submitOrder(false)}
                className={`w-full text-white font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center text-lg disabled:opacity-50 ${orderToEdit ? 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-purple-500/20' : 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-blue-500/20'}`}
              >
                {loading ? 'Procesando...' : (orderToEdit ? 'Actualizar Pedido' : 'Confirmar Pedido')}
              </motion.button>
              {orderToEdit && (
                <button 
                  onClick={() => { setOrderToEdit(null); setCurrentView('gestion_pedidos'); }}
                  className="w-full text-gray-400 hover:text-white py-2 text-sm font-medium transition-colors"
                >
                  Cancelar Edición
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Customizer */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, y: 100, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="bg-gray-900 border border-gray-700/50 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-gray-800/80 bg-gray-800/30 flex justify-between items-start backdrop-blur-md">
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">{selectedProduct.name}</h3>
                  <p className="text-emerald-400 font-bold text-lg">
                    ${configuredProductPrice(selectedProduct, modalPortionType).toLocaleString()}
                  </p>
                  {editingCartItemKey && (
                    <p className="text-xs text-blue-300 mt-2 font-semibold uppercase tracking-wide">Editando producto del pedido</p>
                  )}
                </div>
                <button onClick={() => setSelectedProduct(null)} className="text-gray-500 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 p-2 rounded-full">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 custom-scrollbar bg-gray-900/80">
                {Boolean(selectedProduct.allows_half) && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center">
                      <span className="w-2 h-2 rounded-full bg-fuchsia-500 mr-2"></span> Porción
                    </h4>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setModalPortionType('completo')}
                        className={`p-3 rounded-xl border transition-all ${modalPortionType === 'completo' ? 'bg-fuchsia-500/10 border-fuchsia-500/50 text-fuchsia-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                      >
                        <span className="block font-semibold text-sm">Completo</span>
                        <span className="block mt-1 text-xs text-emerald-400">${Number(selectedProduct.price || 0).toLocaleString()}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalPortionType('mitad')}
                        className={`p-3 rounded-xl border transition-all ${modalPortionType === 'mitad' ? 'bg-fuchsia-500/10 border-fuchsia-500/50 text-fuchsia-300' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                      >
                        <span className="block font-semibold text-sm">1/2 porción</span>
                        <span className="block mt-1 text-xs text-emerald-400">${Number(selectedProduct.half_price || 0).toLocaleString()}</span>
                      </button>
                    </div>
                  </div>
                )}

                {selectedProduct.toppings && selectedProduct.toppings.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span> Toppings (Si/No)</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedProduct.toppings.map(t => {
                        const isSelected = productAddons.toppings.some(x => x.id === t.id);
                        return (
                          <button 
                            key={t.id} 
                            onClick={() => handleAddonToggle('toppings', t)}
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${isSelected ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400 shadow-sm' : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500'}`}
                          >
                            <span className="font-medium text-sm">{t.name}</span>
                            {isSelected && <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedProduct.extras && selectedProduct.extras.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span> Extras (+ Precio)</h4>
                    <div className="space-y-3">
                      {selectedProduct.extras.map(e => {
                        const selected = productAddons.extras.find(x => x.id === e.id);
                        const qty = selected ? selected.qty : 0;
                        return (
                          <div key={e.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 p-3 rounded-xl">
                            <div>
                              <p className="font-medium text-gray-200 text-sm">{e.name}</p>
                              <p className="text-xs text-emerald-400 font-bold">+${(parseFloat(e.price) || 0).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3 bg-gray-900 p-1 rounded-lg border border-gray-800">
                              <button onClick={() => updateAddonQuantity('extras', e, -1)} disabled={!qty} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors">-</button>
                              <span className="w-4 text-center font-bold text-sm text-white">{qty}</span>
                              <button onClick={() => updateAddonQuantity('extras', e, 1)} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedProduct.guarniciones && selectedProduct.guarniciones.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center"><span className="w-2 h-2 rounded-full bg-orange-500 mr-2"></span> Guarniciones</h4>
                    <div className="space-y-3">
                      {selectedProduct.guarniciones.map(g => {
                        const selected = productAddons.guarniciones.find(x => x.id === g.id);
                        const qty = selected ? selected.qty : 0;
                        return (
                          <div key={g.id} className="flex items-center justify-between bg-gray-800/50 border border-gray-700/50 p-3 rounded-xl">
                            <div>
                              <p className="font-medium text-gray-200 text-sm">{g.name}</p>
                              <p className="text-xs text-emerald-400 font-bold">+${(parseFloat(g.price) || 0).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-3 bg-gray-900 p-1 rounded-lg border border-gray-800">
                              <button onClick={() => updateAddonQuantity('guarniciones', g, -1)} disabled={!qty} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 disabled:opacity-30 transition-colors">-</button>
                              <span className="w-4 text-center font-bold text-sm text-white">{qty}</span>
                              <button onClick={() => updateAddonQuantity('guarniciones', g, 1)} className="w-8 h-8 rounded-md bg-gray-800 text-white flex items-center justify-center hover:bg-gray-700 transition-colors"><Plus className="w-4 h-4" /></button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-gray-800 bg-gray-950">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmCustomProduct} 
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex justify-center items-center gap-2 text-lg"
                >
                  <Plus className="w-5 h-5" />
                  {editingCartItemKey ? 'Guardar Cambios' : 'Agregar al Ticket'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
