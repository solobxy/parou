import { Occurrence, TransitLine, FilterState, OccurrenceType } from '../types';
import { CONCELHOS_BY_DISTRITO } from '../data/mockData';
import { inferServiceType } from '../services/transitApi';

export const DEFAULT_FILTERS: FilterState = {
  distrito: 'Todos',
  concelho: 'Todos',
  cidade: 'Todas',
  operador: 'Todos',
  servico: 'Todos',
  tipoTransporte: 'Todos',
  categoria: 'Todas',
  searchQuery: '',
  transporte: 'Todos',
  tipo: 'Todos',
};

export function countActiveFilters(filters: FilterState): number {
  let count = 0;
  if (filters.distrito && filters.distrito !== 'Todos') count++;
  if (filters.concelho && filters.concelho !== 'Todos') count++;
  if (filters.cidade && filters.cidade !== 'Todas') count++;
  if (filters.operador && filters.operador !== 'Todos') count++;
  if (filters.servico && filters.servico !== 'Todos') count++;
  if (filters.tipoTransporte && filters.tipoTransporte !== 'Todos') count++;
  if (filters.categoria && filters.categoria !== 'Todas' && filters.categoria !== 'Todos') count++;
  if (filters.searchQuery && filters.searchQuery.trim().length > 0) count++;
  return count;
}

export function getAvailableConcelhos(distritoOrCidade?: string): string[] {
  if (!distritoOrCidade || distritoOrCidade === 'Todos' || distritoOrCidade === 'Todas') {
    return ['Todos'];
  }
  const clean = distritoOrCidade.trim();
  if (CONCELHOS_BY_DISTRITO[clean]) {
    return CONCELHOS_BY_DISTRITO[clean];
  }
  // Try case-insensitive matching
  for (const [key, list] of Object.entries(CONCELHOS_BY_DISTRITO)) {
    if (key.toLowerCase() === clean.toLowerCase()) {
      return list;
    }
  }
  return ['Todos'];
}

export function matchOccurrence(item: Occurrence, filters: FilterState): boolean {
  // 1. Distrito
  if (filters.distrito && filters.distrito !== 'Todos') {
    const dLower = filters.distrito.toLowerCase().trim();
    const itemDist = (item.district || '').toLowerCase().trim();
    if (!itemDist.includes(dLower) && !dLower.includes(itemDist)) return false;
  }

  // 2. Concelho
  if (filters.concelho && filters.concelho !== 'Todos') {
    const cLower = filters.concelho.toLowerCase().trim();
    const itemConc = (item.concelho || '').toLowerCase().trim();
    const itemLoc = (item.locationDetails || '').toLowerCase().trim();
    if (!itemConc.includes(cLower) && !itemLoc.includes(cLower)) return false;
  }

  // 3. Cidade
  if (filters.cidade && filters.cidade !== 'Todas') {
    const cidLower = filters.cidade.toLowerCase().trim();
    const itemDist = (item.district || '').toLowerCase().trim();
    const itemConc = (item.concelho || '').toLowerCase().trim();
    const itemLoc = (item.locationDetails || '').toLowerCase().trim();
    if (!itemDist.includes(cidLower) && !itemConc.includes(cidLower) && !itemLoc.includes(cidLower)) {
      return false;
    }
  }

  // 4. Operador
  const opVal = filters.operador !== 'Todos' ? filters.operador : filters.transporte;
  if (opVal && opVal !== 'Todos') {
    const opLower = opVal.toLowerCase().trim();
    const cleanOp = opLower.replace(/\s*\([^)]*\)/g, '').trim();
    const itemComp = (item.companyOrService || '').toLowerCase();
    const itemSource = (item.sourceName || '').toLowerCase();
    const itemAuthor = (item.authorName || '').toLowerCase();
    const itemTitle = item.title.toLowerCase();
    const itemDesc = item.description.toLowerCase();

    const matches =
      itemComp.includes(cleanOp) ||
      itemSource.includes(cleanOp) ||
      itemAuthor.includes(cleanOp) ||
      itemTitle.includes(cleanOp) ||
      itemDesc.includes(cleanOp);

    if (!matches) return false;
  }

  // 5. Serviço
  if (filters.servico && filters.servico !== 'Todos') {
    const sLower = filters.servico.toLowerCase().trim();
    const fullText = `${item.title} ${item.description} ${item.locationDetails || ''} ${item.companyOrService || ''}`.toLowerCase();

    if (sLower.includes('suburbano')) {
      const isSub = fullText.includes('suburbano') || fullText.includes('linha ') || fullText.includes('carris metropolitana') || fullText.includes('sintra') || fullText.includes('cascais') || fullText.includes('fertagus');
      if (!isSub) return false;
    } else if (sLower.includes('urbano')) {
      const isUrb = fullText.includes('urbano') || fullText.includes('metro') || fullText.includes('carris') || fullText.includes('stcp') || fullText.includes('tub') || fullText.includes('smtuc') || fullText.includes('cidade');
      if (!isUrb) return false;
    } else if (sLower.includes('regional')) {
      const isReg = fullText.includes('regional') || fullText.includes('inter-regional') || fullText.includes('minho') || fullText.includes('douro');
      if (!isReg) return false;
    } else if (sLower.includes('intercidades') || sLower.includes('longo curso')) {
      const isIc = fullText.includes('intercidades') || fullText.includes('alfa pendular') || fullText.includes('longo curso');
      if (!isIc) return false;
    } else if (sLower.includes('fluvial') || sLower.includes('travessias')) {
      const isFluvial = fullText.includes('barco') || fullText.includes('fluvial') || fullText.includes('tejo') || fullText.includes('transtejo') || fullText.includes('soflusa') || fullText.includes('cacilhas');
      if (!isFluvial) return false;
    } else if (sLower.includes('autoestrada')) {
      const isHwy = fullText.includes('autoestrada') || fullText.includes('brisa') || fullText.includes('ascendi') || fullText.includes('a1') || fullText.includes('a2') || fullText.includes('a5') || fullText.includes('vci') || fullText.includes('cril') || fullText.includes('crel');
      if (!isHwy) return false;
    } else {
      if (!fullText.includes(sLower)) return false;
    }
  }

  // 6. Tipo de Transporte
  if (filters.tipoTransporte && filters.tipoTransporte !== 'Todos') {
    const tLower = filters.tipoTransporte.toLowerCase().trim();
    const fullText = `${item.title} ${item.description} ${item.companyOrService || ''}`.toLowerCase();

    if (tLower === 'metro') {
      if (!fullText.includes('metro')) return false;
    } else if (tLower === 'comboio') {
      if (!fullText.includes('comboio') && !fullText.includes('cp') && !fullText.includes('fertagus') && !fullText.includes('ferrovi')) return false;
    } else if (tLower === 'autocarro') {
      if (!fullText.includes('autocarro') && !fullText.includes('carris') && !fullText.includes('stcp') && !fullText.includes('tub') && !fullText.includes('smtuc') && !fullText.includes('carreira')) return false;
    } else if (tLower.includes('barco') || tLower.includes('fluvial')) {
      if (!fullText.includes('barco') && !fullText.includes('fluvial') && !fullText.includes('transtejo') && !fullText.includes('soflusa') && !fullText.includes('navio') && !fullText.includes('catamarã')) return false;
    } else if (tLower === 'elétrico') {
      if (!fullText.includes('elétrico') && !fullText.includes('eletrico')) return false;
    } else if (tLower.includes('rodoviário') || tLower.includes('rodoviario')) {
      const isRoad = fullText.includes('estrada') || fullText.includes('autoestrada') || fullText.includes('carro') || fullText.includes('veículo') || fullText.includes('trânsito') || fullText.includes('acidente') || fullText.includes('colisão') || fullText.includes('a1') || fullText.includes('ic') || fullText.includes('en');
      if (!isRoad) return false;
    }
  }

  // 7. Categoria
  const catVal = filters.categoria !== 'Todas' ? filters.categoria : filters.tipo;
  if (catVal && catVal !== 'Todas' && catVal !== 'Todos') {
    const typeMapping: Record<string, OccurrenceType> = {
      'Acidentes': 'ACIDENTE',
      'Avarias': 'AVARIA',
      'Greves': 'GREVE',
      'Atrasos': 'ATRASOS',
      'Obras': 'OBRAS',
      'Cortes de Trânsito': 'CORTE',
      'Serviços Públicos': 'SERVICO_PUBLICO',
    };
    const expected = typeMapping[catVal];
    if (expected && item.type !== expected) return false;
  }

  // Free text search query
  if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
    const q = filters.searchQuery.toLowerCase().trim();
    const matchesText =
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.district.toLowerCase().includes(q) ||
      (item.concelho && item.concelho.toLowerCase().includes(q)) ||
      (item.locationDetails && item.locationDetails.toLowerCase().includes(q)) ||
      (item.companyOrService && item.companyOrService.toLowerCase().includes(q)) ||
      (item.sourceName && item.sourceName.toLowerCase().includes(q));

    if (!matchesText) return false;
  }

  return true;
}

export function matchTransitLine(line: TransitLine, filters: FilterState): boolean {
  // 1. Distrito
  if (filters.distrito && filters.distrito !== 'Todos') {
    const dLower = filters.distrito.toLowerCase().trim();
    const lineDist = (line.district || line.city).toLowerCase().trim();
    if (!lineDist.includes(dLower) && !dLower.includes(lineDist)) return false;
  }

  // 2. Concelho
  if (filters.concelho && filters.concelho !== 'Todos') {
    const cLower = filters.concelho.toLowerCase().trim();
    const fullText = `${line.name} ${line.code} ${line.direction} ${line.city} ${line.operator}`.toLowerCase();
    if (!fullText.includes(cLower) && line.city.toLowerCase() !== cLower) return false;
  }

  // 3. Cidade
  if (filters.cidade && filters.cidade !== 'Todas') {
    const cidLower = filters.cidade.toLowerCase().trim();
    if (line.city.toLowerCase() !== cidLower) return false;
  }

  // 4. Operador
  const opVal = filters.operador !== 'Todos' ? filters.operador : filters.transporte;
  if (opVal && opVal !== 'Todos') {
    const opNorm = opVal.toLowerCase().replace(/\s*\([^)]*\)/g, '').trim();
    const lineOp = line.operator.toLowerCase();
    if (!lineOp.includes(opNorm) && !opNorm.includes(lineOp)) return false;
  }

  // 5. Serviço
  if (filters.servico && filters.servico !== 'Todos') {
    const sLower = filters.servico.toLowerCase().trim();
    const serv = (line.serviceType || inferServiceType(line)).toLowerCase();
    if (!serv.includes(sLower) && !sLower.includes(serv)) return false;
  }

  // 6. Tipo de Transporte
  if (filters.tipoTransporte && filters.tipoTransporte !== 'Todos') {
    const mLower = filters.tipoTransporte.toLowerCase().trim();
    if (mLower.includes('rodoviário') || mLower.includes('rodoviario')) {
      if (line.mode !== 'Autocarro') return false;
    } else {
      if (!line.mode.toLowerCase().includes(mLower) && !mLower.includes(line.mode.toLowerCase())) {
        return false;
      }
    }
  }

  // 7. Categoria
  const catVal = filters.categoria !== 'Todas' ? filters.categoria : filters.tipo;
  if (catVal && catVal !== 'Todas' && catVal !== 'Todos') {
    const cLower = catVal.toLowerCase().trim();
    if (cLower === 'atrasos' && line.status !== 'Atrasado') return false;
    if (cLower === 'avarias' || cLower === 'cortes de trânsito') {
      const isSevere = line.status === 'Interrompido' || (line.statusMessage && /avaria|corte|interrup|suspens/i.test(line.statusMessage));
      if (!isSevere) return false;
    }
    if (cLower === 'greves') {
      const isGreve = line.statusMessage && /greve|paralisa/i.test(line.statusMessage);
      if (!isGreve) return false;
    }
    if (cLower === 'obras') {
      const isObras = line.statusMessage && /obras|manutenção/i.test(line.statusMessage);
      if (!isObras) return false;
    }
  }

  // Free text search query
  if (filters.searchQuery && filters.searchQuery.trim().length > 0) {
    const q = filters.searchQuery.toLowerCase().trim();
    const destinations = line.nextDepartures.map((d) => d.destination).join(' ');
    const serv = line.serviceType || inferServiceType(line);
    const matches =
      line.code.toLowerCase().includes(q) ||
      line.name.toLowerCase().includes(q) ||
      line.direction.toLowerCase().includes(q) ||
      line.operator.toLowerCase().includes(q) ||
      line.city.toLowerCase().includes(q) ||
      (line.district && line.district.toLowerCase().includes(q)) ||
      serv.toLowerCase().includes(q) ||
      destinations.toLowerCase().includes(q) ||
      (line.statusMessage && line.statusMessage.toLowerCase().includes(q));

    if (!matches) return false;
  }

  return true;
}
