const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

function compile(source){
  if(!source||!source.points||typeof source.points!=='object'||Array.isArray(source.points))throw Error('store_points_missing');
  const keys={},shards=new Map();
  for(const [key,points] of Object.entries(source.points)){
    if(!key.includes('/')||!points||typeof points!=='object'||Array.isArray(points)||
      Object.values(points).some(list=>!Array.isArray(list)||list.some(point=>!point||typeof point!=='object'||Array.isArray(point))))throw Error('store_points_invalid');
    const file=crypto.createHash('sha256').update(key).digest('hex').slice(0,16)+'.json';
    if(shards.has(file))throw Error('store_key_collision');
    keys[key]=file;shards.set(file,{version:1,key,points});
  }
  if(!shards.size)throw Error('store_points_empty');
  return {index:{version:1,as_of:source.as_of??null,keys},shards};
}
function generate(sourcePath,output){
  const {index,shards}=compile(JSON.parse(fs.readFileSync(sourcePath,'utf8')));
  fs.mkdirSync(output,{recursive:true});
  let maxShardBytes=0,totalShardBytes=0;
  for(const [file,shard] of shards){
    const raw=JSON.stringify(shard)+'\n',bytes=Buffer.byteLength(raw);
    fs.writeFileSync(path.join(output,file),raw);maxShardBytes=Math.max(maxShardBytes,bytes);totalShardBytes+=bytes;
  }
  const rawIndex=JSON.stringify(index)+'\n';fs.writeFileSync(path.join(output,'index.json'),rawIndex);
  return {keys:shards.size,indexBytes:Buffer.byteLength(rawIndex),maxShardBytes,totalShardBytes};
}
if(require.main===module){
  const root=path.resolve(__dirname,'..');
  try{
    const options={},args=process.argv.slice(2);
    for(let i=0;i<args.length;i+=2){
      const key=args[i]==='--source'?'source':args[i]==='--out'?'out':null;
      if(!key||Object.hasOwn(options,key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Usage: node build/prep_store_points.js [--source <summary.json>] [--out <store-points-directory>]');
      options[key]=args[i+1];
    }
    console.log(JSON.stringify(generate(options.source||path.join(root,'web/data/store-summary.json'),options.out||path.join(root,'web/data/store-points'))));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
module.exports={compile,generate};


