export function listToJSON(list, constructors) {
    let output = [];
    let idIndex = [];
    try {
        for (let i in list) {
            output[i] = toJSON(list[i], constructors, idIndex, []);
        }
    }
    catch (error) {
        console.log(error);
    }
    finally {
        for (let i = 0; i < idIndex.length; i++) {
            if (!(i in idIndex)) {
                console.log('listToJSON: missing __id__ ' + i);
            }
        }
        for (let obj of idIndex) {
            if (!('__id__' in obj)) {
                throw 'listToJSON: object lacks __id__';
            }
            delete obj['__id__'];
            delete obj['__written__'];
        }
    }
    return output;
}
function shouldBePointer(obj, idIndex, constructors) {
    if (obj instanceof Object && '__id__' in obj) {
        if (obj['__id__'] in idIndex && obj['__written__']) {
            return true;
        }
    }
    // either not a pointer-able object, or needs to be added to idIndex
    return false;
}
function addToIndex(obj, idIndex, constructors) {
    if (obj instanceof Object) {
        if (obj.constructor.name != 'Object' && obj.constructor.name != 'Array' &&
            !(obj.constructor.name in constructors)) {
            throw 'missing constructor for ' + obj.constructor.name;
        }
        if (!('__id__' in obj)) {
            idIndex.push(obj);
            obj['__id__'] = idIndex.length - 1;
            obj['__written__'] = false;
            return true;
        }
        else {
            if (idIndex[obj['__id__']] != obj) {
                throw 'addToIndex: __id__ collision at ' + obj['__id__'];
            }
        }
    }
    return false;
}
function printTrail(trail, obj, reading = false) {
    let str = '';
    // pad out for depth
    for (let entry of trail) {
        str += '  ';
    }
    // variable name or array index
    if (trail.length > 0) {
        str += trail[trail.length - 1] + ' ';
    }
    // object type and value
    let type = typeof (obj);
    if (typeof (obj) == 'object' && obj) {
        if (reading && '__class__' in obj) {
            type = obj['__class__'];
        }
        else {
            type = obj.constructor.name;
        }
    }
    else {
        if (typeof (obj) == 'string') {
            str += '\"' + obj + '\"' + ' ';
        }
        else {
            str += obj + ' ';
        }
    }
    str += type;
    // pointers
    if (typeof (obj) == 'object' && obj) {
        if (reading) {
            if ('__pointer__' in obj)
                str += ' -> ' + obj['__pointer__'];
            if ('__id__' in obj)
                str += ':' + obj['__id__'];
        }
        else {
            if ('__id__' in obj)
                str += ' -> ' + obj['__id__'];
        }
    }
    console.log(str);
}
export function toJSON(obj, constructors, idIndex, trail) {
    printTrail(trail, obj);
    if (trail.length > 20) {
        throw 'Maximum recursion depth exceeded';
    }
    if (obj === null || obj === undefined) {
        return obj;
    }
    else if (shouldBePointer(obj, idIndex, constructors)) {
        return toJSONPointer(obj, idIndex);
    }
    else if (obj.toJSON) {
        addToIndex(obj, idIndex, constructors);
        if ('__id__' in obj) {
            obj['__written__'] = true;
        }
        let output = obj.toJSON(constructors, idIndex);
        if ('__id__' in obj) {
            output['__id__'] = obj['__id__'];
        }
        return output;
    } /* else if ( obj instanceof Array ) {

        // add array to object index
        addToIndex( obj, idIndex, constructors );

        if ( '__id__' in obj as any ) {
            (obj as any)['__written__'] = true;
        }

        // convert array members to JSON
        let arr: Array<any> = [];

        for ( let i in obj ) {
            if ( i == '__written__') continue;

            arr[i] = toJSON( obj[i], constructors, idIndex, trail.concat( i + '' ) );
        }

        // insert id
        (arr as any)['__id__'] = (obj as any)['__id__'];

        return arr;

    }*/
    else if (obj instanceof Object) {
        // 
        addToIndex(obj, idIndex, constructors);
        let flat = {};
        if (obj instanceof Array)
            flat = [];
        if ('__id__' in obj) {
            flat['__id__'] = obj['__id__'];
            obj['__written__'] = true;
        }
        if (obj.constructor.name != 'Object' && obj.constructor.name != 'Array') {
            flat['__class__'] = obj.constructor.name;
        }
        for (let varname in obj) {
            if (varname == '__written__')
                continue;
            flat[varname] = toJSON(obj[varname], constructors, idIndex, trail.concat(varname));
        }
        return flat;
        // literals
    }
    else {
        return obj;
    }
}
export function toJSONPointer(obj, idIndex) {
    if (obj === null || obj === undefined) {
        return null;
        // some functions force pointers, so need to add index objects here
    }
    else if (!('__id__' in obj)) {
        idIndex.push(obj);
        obj['__id__'] = idIndex.length - 1;
        obj['__written__'] = false;
    }
    let classname = '';
    if (obj.constructor)
        classname = obj.constructor.name;
    return { "__pointer__": obj['__id__'], "__class__": classname };
}
export function checkSchema(obj, schemaName) {
    return true;
}
function indexOnRead(json, obj, idIndex) {
    // add to id index
    if ('__id__' in json) {
        if (json['__id__'] in idIndex) {
            throw 'indexOnRead: __id__ collision at ' + json['__id__'];
        }
        idIndex[json['__id__']] = obj;
    }
}
export function fromJSON(json, constructors, idIndex, trail) {
    printTrail(trail, json, true);
    if (trail.length > 20) {
        throw 'Maximum recursion depth exceeded';
    }
    if (json === null || json === undefined) {
        return null;
    }
    else if (json instanceof Array) {
        let arr = [];
        for (let i in json) {
            if (i != '__id__') {
                arr[i] = fromJSON(json[i], constructors, idIndex, trail.concat(i + ''));
            }
        }
        indexOnRead(json, arr, idIndex);
        return arr;
    }
    else if (json instanceof Object) {
        if ('__pointer__' in json) {
            return json;
        }
        let obj = {};
        // create empty object (classes need to have constructors that take no args)
        if ('__class__' in json) {
            let type = json['__class__'];
            if (!(type in constructors)) {
                throw 'fromJSON: unhandled class ' + type;
            }
            obj = new constructors[type]();
        }
        // add class members
        for (let varname in json) {
            if (varname != '__id__') {
                obj[varname] = fromJSON(json[varname], constructors, idIndex, trail.concat(varname + ''));
            }
        }
        indexOnRead(json, obj, idIndex);
        return obj;
    }
    else {
        return json;
    }
}
export function resolvePointersIn(obj, idIndex, toplevel = false) {
    if (obj instanceof Array) {
        for (let i in obj) {
            // resolve pointer
            if (obj[i] instanceof Object) {
                if ('__pointer__' in obj[i]) {
                    obj[i] = resolvePointer(obj[i]['__pointer__'], idIndex);
                }
                else {
                    resolvePointersIn(obj[i], idIndex);
                }
            }
        }
    }
    else if (obj instanceof Object) {
        if (obj['__pointer__']) {
            throw 'Recursing too deep (should have resolved pointer)';
        }
        for (let i in obj) {
            // resolve pointer
            if (obj[i] instanceof Object) {
                if ('__pointer__' in obj[i]) {
                    obj[i] = resolvePointer(obj[i]['__pointer__'], idIndex);
                }
                else {
                    resolvePointersIn(obj[i], idIndex);
                }
            }
        }
        // run init method after all pointers in object have been resolved
        if (obj.init) {
            obj.init();
        }
    }
    else {
        return;
    }
}
function resolvePointer(index, idIndex) {
    if (!(index in idIndex)) {
        console.log(idIndex);
        throw 'resolvePointer: no pointer with id ' + index;
    }
    return idIndex[index];
}
export function checkStructure(obj1, obj2, trail, trail2) {
    if (trail.indexOf(obj1) >= 0) {
        return true;
    }
    let result = true;
    for (let i in obj1) {
        // missing key
        if (!(i in obj2)) {
            let str = '';
            for (let varname of trail2) {
                str += '.' + varname;
            }
            console.log(str + '.' + i + ' missing from obj2');
            return false;
        }
        if (obj1[i] instanceof Object) {
            let type1 = obj1[i].constructor.name;
            let type2 = obj2[i].constructor.name;
            // mismatched types
            if (type1 != type2) {
                let str = '';
                for (let varname of trail2) {
                    str += '.' + varname;
                }
                console.log(str + '.' + i + ' type: ' + type1 + ' != ' + type2);
                return false;
            }
            result = result && checkStructure(obj1[i], obj2[i], trail.concat(obj1), trail2.concat(i));
        }
        else {
            if (obj1[i] === obj2[i]) {
                continue;
            }
            else {
                // mismatched values
                let str = '';
                for (let varname of trail2) {
                    str += '.' + varname;
                }
                console.log(str + '.' + i + ': ' + obj1[i] + ' != ' + obj2[i]);
                return false;
            }
        }
    }
    for (let i in obj2) {
        // missing key
        if (!(i in obj1)) {
            let str = '';
            for (let varname of trail2) {
                str += '.' + varname;
            }
            console.log(str + '.' + i + ' missing from obj1');
            return false;
        }
    }
    return result;
}
