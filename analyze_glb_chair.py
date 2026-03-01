import struct, json, math, sys, os

def parse_glb(fp):
    with open(fp, 'rb') as f:
        magic = f.read(4)
        if magic != b'glTF': raise ValueError('Bad GLB')
        ver, tlen = struct.unpack('<II', f.read(8))
        print('GLB version:', ver, 'total length:', tlen, 'bytes')
        jc = None; bc = None
        while f.tell() < tlen:
            cl, ct = struct.unpack('<II', f.read(8))
            cd = f.read(cl)
            if ct == 0x4E4F534A: jc = json.loads(cd)
            elif ct == 0x004E4942: bc = cd
    return jc, bc

def m4mul(a, b):
    r = [0.0]*16
    for c in range(4):
        for rr in range(4):
            s = 0.0
            for k in range(4): s += a[rr+k*4]*b[k+c*4]
            r[rr+c*4] = s
    return r

def m4trs(t, rot, sc):
    tx,ty,tz = t; qx,qy,qz,qw = rot; sx,sy,sz = sc
    xx=qx*qx; yy=qy*qy; zz=qz*qz
    xy=qx*qy; xz=qx*qz; yz=qy*qz
    wx=qw*qx; wy=qw*qy; wz=qw*qz
    m=[0.0]*16
    m[0]=(1-2*(yy+zz))*sx; m[1]=(2*(xy+wz))*sx; m[2]=(2*(xz-wy))*sx
    m[4]=(2*(xy-wz))*sy; m[5]=(1-2*(xx+zz))*sy; m[6]=(2*(yz+wx))*sy
    m[8]=(2*(xz+wy))*sz; m[9]=(2*(yz-wx))*sz; m[10]=(1-2*(xx+yy))*sz
    m[12]=tx; m[13]=ty; m[14]=tz; m[15]=1.0
    return m

def m4pt(m, p):
    x,y,z = p
    return (m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14])

def bpm(nodes):
    pm = {}
    for i, n in enumerate(nodes):
        for ci in n.get('children', []): pm[ci] = i
    return pm

def nlm(node):
    if 'matrix' in node: return list(node['matrix'])
    t = node.get('translation',[0,0,0])
    r = node.get('rotation',[0,0,0,1])
    s = node.get('scale',[1,1,1])
    return m4trs(t,r,s)

def cwm(ni, nodes, pm, cache):
    if ni in cache: return cache[ni]
    loc = nlm(nodes[ni])
    if ni in pm:
        pw = cwm(pm[ni], nodes, pm, cache)
        w = m4mul(pw, loc)
    else: w = loc
    cache[ni] = w; return w

def gab(gltf, ais):
    accs = gltf.get('accessors',[])
    mn = [float('inf')]*3; mx = [float('-inf')]*3
    for ai in ais:
        a = accs[ai]
        if 'min' in a and 'max' in a and len(a['min'])>=3:
            for i in range(3): mn[i]=min(mn[i],a['min'][i]); mx[i]=max(mx[i],a['max'][i])
    if mn[0]==float('inf'): return None,None
    return mn, mx

def gmpa(gltf, mi):
    mesh = gltf['meshes'][mi]; ai=[]
    for p in mesh.get('primitives',[]):
        at = p.get('attributes',{})
        if 'POSITION' in at: ai.append(at['POSITION'])
    return ai

def cwbb(lmn,lmx,wm):
    corners=[]
    for x in (lmn[0],lmx[0]):
        for y in (lmn[1],lmx[1]):
            for z in (lmn[2],lmx[2]):
                corners.append(m4pt(wm,(x,y,z)))
    wn=[min(c[i] for c in corners) for i in range(3)]
    wx=[max(c[i] for c in corners) for i in range(3)]
    return wn,wx

def R(v,d=4): return str(round(v,d))

def analyze(fp):
    print('Analyzing:', fp); print()
    gltf, bd = parse_glb(fp)
    nodes = gltf.get('nodes',[]); meshes = gltf.get('meshes',[])
    print('Nodes:', len(nodes), 'Meshes:', len(meshes)); print()
    pm = bpm(nodes); wmc = {}
    mnm = {}
    for ni, nd in enumerate(nodes):
        if 'mesh' in nd: mnm.setdefault(nd['mesh'],[]).append(ni)
    infos = []
    for mi in range(len(meshes)):
        m = meshes[mi]; mn = m.get('name','mesh_'+str(mi))
        nis = mnm.get(mi,[])
        if not nis: continue
        pa = gmpa(gltf,mi); lmn,lmx = gab(gltf,pa)
        if lmn is None: continue
        for ni in nis:
            wm = cwm(ni,nodes,pm,wmc); wn,wx = cwbb(lmn,lmx,wm)
            nn = nodes[ni].get('name','node_'+str(ni))
            sz = [wx[i]-wn[i] for i in range(3)]
            ct = [(wn[i]+wx[i])/2 for i in range(3)]
            infos.append({'mi':mi,'ni':ni,'mn':mn,'nn':nn,'wn':wn,'wx':wx,'sz':sz,'ct':ct})
    sep = '='*130
    print(sep)
    hdr = '# Node Name' + ' '*39 + 'Mesh Name' + ' '*31 + 'Center (X,Y,Z)' + ' '*16 + 'Size (X,Y,Z)'
    print(hdr); print(sep)
    infos.sort(key=lambda x: x['sz'][0]*x['sz'][1]*x['sz'][2], reverse=True)
    for i in infos:
        c=i['ct']; s=i['sz']
        line = str(i['ni']).ljust(5)+i['nn'][:49].ljust(50)+' '+i['mn'][:39].ljust(40)
        line += ' ('+R(c[0],2).rjust(8)+', '+R(c[1],2).rjust(8)+', '+R(c[2],2).rjust(8)+')   '
        line += '('+R(s[0],2).rjust(7)+', '+R(s[1],2).rjust(7)+', '+R(s[2],2).rjust(7)+')'
        print(line)
    amn=[float('inf')]*3; amx=[float('-inf')]*3
    for i in infos:
        for j in range(3): amn[j]=min(amn[j],i['wn'][j]); amx[j]=max(amx[j],i['wx'][j])
    ssz=[amx[j]-amn[j] for j in range(3)]
    sct=[(amn[j]+amx[j])/2 for j in range(3)]
    print(); print(sep); print('SCENE BOUNDS (raw):')
    for ax_name,idx in [('X',0),('Y',1),('Z',2)]:
        print('  '+ax_name+': ['+R(amn[idx],2)+', '+R(amx[idx],2)+'] size='+R(ssz[idx],2))
    print('  Center: ('+R(sct[0],2)+', '+R(sct[1],2)+', '+R(sct[2],2)+')')
    print(); print(sep); print('CHAIR CANDIDATE SEARCH:'); print(sep)
    ckw=['chair','seat','stool','bench','armchair','sofa','sit','fauteuil','chaise']
    nc=[]
    for i in infos:
        cn=(i['mn']+' '+i['nn']).lower()
        for kw in ckw:
            if kw in cn: nc.append(i); break
    if nc:
        print(); print('Found by name:')
        for i in nc:
            c=i['ct']; s=i['sz']
            print('  -> '+i['nn']+' / '+i['mn'])
            print('     Center: ('+R(c[0],2)+', '+R(c[1],2)+', '+R(c[2],2)+')')
            print('     Size:   ('+R(s[0],2)+', '+R(s[1],2)+', '+R(s[2],2)+')')
    else: print(); print('No chair names found.')
    print(); print('Size search (1-30 units, aspect<6):')
    ssc=[]
    for i in infos:
        sx,sy,sz=i['sz']
        if all(1.0<=d<=30.0 for d in [sx,sy,sz]):
            dims=sorted([sx,sy,sz])
            if dims[2]/max(dims[0],0.01)<6: ssc.append(i)
    if ssc:
        for i in ssc:
            c=i['ct']; s=i['sz']
            print('  -> Node '+str(i['ni'])+': '+i['nn'][:50])
            print('     Mesh: '+i['mn'][:50])
            print('     Center: ('+R(c[0],2)+', '+R(c[1],2)+', '+R(c[2],2)+')')
            print('     Size:   ('+R(s[0],2)+', '+R(s[1],2)+', '+R(s[2],2)+')')
            print('     Volume: '+R(s[0]*s[1]*s[2],2))
    else:
        print('  No strict. Relaxed (0.5-50, aspect<8):')
        for i in infos:
            sx,sy,sz=i['sz']
            if all(0.5<=d<=50.0 for d in [sx,sy,sz]):
                dims=sorted([sx,sy,sz])
                if dims[2]/max(dims[0],0.01)<8:
                    ssc.append(i); c=i['ct']; s=i['sz']
                    print('  -> Node '+str(i['ni'])+': '+i['nn'][:50])
                    print('     Center: ('+R(c[0],2)+', '+R(c[1],2)+', '+R(c[2],2)+')')
                    print('     Size: ('+R(s[0],2)+', '+R(s[1],2)+', '+R(s[2],2)+')')
    if not nc and not ssc:
        print(); print('  No candidates. All by volume:')
        mid=sorted(infos,key=lambda x:x['sz'][0]*x['sz'][1]*x['sz'][2])
        for i in mid[:30]:
            c=i['ct']; s=i['sz']; v=s[0]*s[1]*s[2]
            if v>0.01: print('  Node '+str(i['ni'])+': '+i['nn'][:45]+' sz=('+R(s[0],2)+','+R(s[1],2)+','+R(s[2],2)+') ct=('+R(c[0],2)+','+R(c[1],2)+','+R(c[2],2)+')')
    best=None
    if nc: best=nc[0]
    elif ssc: best=ssc[0]
    else:
        sv=sorted(infos,key=lambda x:x['sz'][0]*x['sz'][1]*x['sz'][2])
        for i in sv:
            if i['sz'][0]*i['sz'][1]*i['sz'][2]>1.0: best=i; break
        if best is None and infos: best=sv[len(sv)//2]
    if best is None: print('ERROR: No chair.'); return
    print(); print(sep); print('AVATAR PLACEMENT'); print(sep)
    rc=best['ct']; rs=best['sz']
    print('Best chair: '+best['nn']+' / '+best['mn'])
    print('  Raw center: ('+R(rc[0])+', '+R(rc[1])+', '+R(rc[2])+')')
    print('  Raw size:   ('+R(rs[0])+', '+R(rs[1])+', '+R(rs[2])+')')
    print('  Raw w_min:  ('+R(best['wn'][0])+', '+R(best['wn'][1])+', '+R(best['wn'][2])+')')
    print('  Raw w_max:  ('+R(best['wx'][0])+', '+R(best['wx'][1])+', '+R(best['wx'][2])+')')
    TGT=12.0; md=max(ssz); scale=TGT/md
    print('Scene max dim:', R(md,2)); print('Auto-scale:', R(scale,6))
    smn=[amn[i]*scale for i in range(3)]
    smx=[amx[i]*scale for i in range(3)]
    scn=[(smn[i]+smx[i])/2 for i in range(3)]
    sfl=smn[1]
    print('Scaled bounds:')
    print('  X: ['+R(smn[0])+', '+R(smx[0])+']')
    print('  Y: ['+R(smn[1])+', '+R(smx[1])+']')
    print('  Z: ['+R(smn[2])+', '+R(smx[2])+']')
    print('  Scaled center: ('+R(scn[0])+', '+R(scn[1])+', '+R(scn[2])+')')
    print('  Scaled floor Y:', R(sfl))
    ox=-sct[0]*scale; oy=-sfl-1.2; oz=-sct[2]*scale
    print('Offset: ('+R(ox)+', '+R(oy)+', '+R(oz)+')')
    ax=rc[0]*scale+ox; ay=rc[1]*scale+oy; az=rc[2]*scale+oz
    print(); print(sep)
    print('FINAL AVATAR POSITION (transformed):')
    print('  X:', R(ax)); print('  Y:', R(ay)); print('  Z:', R(az))
    print('  As array: ['+R(ax)+', '+R(ay)+', '+R(az)+']')
    print(sep)
    allc=nc+ssc; seen=set(); uniq=[]
    for cc in allc:
        k=(cc['mi'],cc['ni'])
        if k not in seen: seen.add(k); uniq.append(cc)
    if len(uniq)>1:
        print(); print('All candidates in final space:')
        for i in uniq:
            irc=i['ct']
            iax=irc[0]*scale+ox; iay=irc[1]*scale+oy; iaz=irc[2]*scale+oz
            irs=i['sz']
            print('  '+i['nn']+': pos=['+R(iax)+','+R(iay)+','+R(iaz)+'] sz=['+R(irs[0]*scale)+','+R(irs[1]*scale)+','+R(irs[2]*scale)+']')
    print(); print(sep); print('SUMMARY FOR CODE:')
    print('  // Chair: '+best['nn'])
    print('  // Raw center: ['+R(rc[0],2)+', '+R(rc[1],2)+', '+R(rc[2],2)+']')
    print('  // Scale: '+R(scale,6)+', Offset: ['+R(ox)+', '+R(oy)+', '+R(oz)+']')
    print('  const avatarPosition = ['+R(ax)+', '+R(ay)+', '+R(az)+'];')
    print(sep)

if __name__ == '__main__':
    p = os.path.join('C:'+os.sep, 'Users', 'Ayman Boujjar', 'Desktop', 'avatar', 'frontend', 'public', 'environments', 'silent_hill-library.glb')
    analyze(p)
