import { onMounted, onBeforeUnmount, ref, shallowRef, type Ref } from 'vue';

export function useLeafletMap(el: Ref<HTMLElement | null>) {
  const map = shallowRef<any>(null);
  const L = shallowRef<any>(null);
  const ready = ref(false);
  const readyCbs: Array<(map: any, L: any) => void> = [];

  function onReady(cb: (map: any, L: any) => void) {
    if (ready.value && map.value && L.value) {
      cb(map.value, L.value);
    } else {
      readyCbs.push(cb);
    }
  }

  onMounted(async () => {
    if (!el.value) return;
    const leaflet = await import('leaflet');
    const Lmod: any = (leaflet as any).default ?? leaflet;
    L.value = Lmod;
    const m = Lmod.map(el.value).setView([20, 0], 2);
    Lmod.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
    }).addTo(m);
    map.value = m;
    ready.value = true;
    for (const cb of readyCbs.splice(0)) cb(m, Lmod);
  });

  onBeforeUnmount(() => {
    if (map.value) {
      map.value.remove();
      map.value = null;
    }
  });

  return { map, onReady };
}
