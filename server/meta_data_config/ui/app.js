const { useState, useEffect } = React;
const { Layout, Menu, Table, Button, Upload, Modal, Form, Input, message } = antd;
const { Header, Sider, Content } = Layout;

function App(){
  const [category, setCategory] = useState('buildings');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(()=>{ fetchList(category); }, [category]);
  function fetchList(cat){
    setLoading(true);
    fetch(`/api/meta/${cat}`).then(r=>r.json()).then(data=>{ setItems(data); setLoading(false); });
  }
  function openEdit(item){ setSelected(item); Modal.info({ title: item.id, content: JSON.stringify(item.raw, null, 2), width: 800 }) }
  function downloadDb(){ window.location = '/api/export/sqlite' }
  function handleUpload(file){
    const form = new FormData();
    form.append('file', file);
    form.append('category', category);
    form.append('item', file.name);
    fetch('/api/upload', { method: 'POST', body: form }).then(r=>r.json()).then(j=>{ message.success('Uploaded'); });
    return false;
  }
  return (
    React.createElement(Layout, {style:{minHeight:'80vh'}},
      React.createElement(Sider, {width:220, style:{background:'#fff', padding:'12px'}},
        React.createElement(Menu, {mode:'inline', defaultSelectedKeys:[category], onClick: (e)=>setCategory(e.key)},
          React.createElement(Menu.Item, {key:'buildings'}, 'Buildings'),
          React.createElement(Menu.Item, {key:'crops'}, 'Crops'),
          React.createElement(Menu.Item, {key:'professions'}, 'Professions'),
          React.createElement(Menu.Item, {key:'names'}, 'Names'),
          React.createElement(Menu.Item, {key:'texts'}, 'Texts')
        )
      ),
      React.createElement(Layout, null,
        React.createElement(Header, {className:'header', style:{background:'transparent', padding:0}},
          React.createElement('div', null, React.createElement('h2', null, 'Meta Data Config')),
          React.createElement('div', null, React.createElement(Button, {onClick:downloadDb, type:'primary'}, 'Download meta_data.db'))
        ),
        React.createElement(Content, {style:{marginTop:16}},
          React.createElement('div', {className:'panel'},
            React.createElement('div', {style:{display:'flex', justifyContent:'space-between', marginBottom:12}},
              React.createElement('div', null, React.createElement('h3', null, category)),
              React.createElement('div', null, React.createElement(Upload, {beforeUpload:handleUpload, showUploadList:false}, React.createElement(Button, null, 'Upload file')))
            ),
            React.createElement(Table, {dataSource: items, loading: loading, rowKey: (r=>r.id), pagination: false, columns: [
              {title:'ID', dataIndex:'id', key:'id'},
              {title:'Label', dataIndex:'label', key:'label'},
              {title:'Desc', dataIndex:'description', key:'description'},
              {title:'Actions', key:'actions', render: (text, record)=>React.createElement(Button, {onClick: ()=>openEdit(record)}, 'View')}
            ]})
          )
        )
      )
    )
  )
}

ReactDOM.render(React.createElement(App), document.getElementById('root'));
