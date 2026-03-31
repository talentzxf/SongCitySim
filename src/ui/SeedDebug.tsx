import React from 'react'
import { Button, Input, Space } from 'antd'
import { useSimulation } from '../state/simulation'

export default function SeedDebug() {
  const [seed, setSeed] = React.useState<string>('')
  React.useEffect(()=>{
    try{ const s=(window as any).__WORLD_SEED__; if(s) setSeed(String(s)) }catch(e){}
  },[])

  function applySeed() {
    // update URL without reload
    try{
      const url = new URL(window.location.href)
      if(seed) url.searchParams.set('seed', seed)
      else url.searchParams.delete('seed')
      window.history.replaceState({}, '', url.toString())
      // reload page to pick up seed in generation
      window.location.reload()
    }catch(e){ console.error(e) }
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <Input style={{ width: 120 }} value={seed} onChange={e=>setSeed(e.target.value)} placeholder="seed (number)" />
      <Space>
        <Button size="small" onClick={()=>{ setSeed(String(Math.floor(Math.random()*1e9))); }}>
          随机
        </Button>
        <Button size="small" type="primary" onClick={applySeed}>应用</Button>
      </Space>
    </div>
  )
}
