export function listToJSON( list: Array<any>, constructors: { [key: string]: any } ): any {
	let output: Array<any> = [];

	for ( let i in list ) {
		output[i] = toJSON( list[i], constructors, true );
	}

	return output;
}

export function toJSON( obj: any, constructors: { [key: string]: any }, toplevel: boolean=false): any {
	//let flattened: { [key: string]: any } = {};

	if ( obj === null || obj === undefined ) {
		return obj;

	} else if ( !toplevel && obj.constructor.name in constructors ) {
		return toJSONPointer( obj );

	} else if ( obj.toJSON ) {
		return obj.toJSON( constructors );

	} else if ( obj instanceof Array ) {
		let arr: Array<any> = [];

		for ( let i in obj ) {
			arr[i] = toJSON( obj[i], constructors );
		}

		return arr;

	} else if ( obj instanceof Object ) {
		let flat: any = {};

		if ( obj.constructor.name != 'Object' ) {
			flat['__class__'] = obj.constructor.name;
		}

		for ( let varname in obj ) {
			flat[varname] = toJSON( obj[varname], constructors );			
		}

		return flat;

	// literals
	} else {
		return obj;
	}
}

export function toJSONPointer( obj: any ): any {
	if ( obj === null || obj === undefined ) {
		return null;

	} else if ( !('id' in obj) || obj.id < 0 ) {
		throw 'toJSONPointer: cannot make pointer of object ' + obj;

	} else {
		let classname: string = '';
		if ( obj.constructor ) classname = obj.constructor.name;

		return { "__pointer__": obj.id, "__class__": classname };
	}
}

export function checkSchema( obj: any, schemaName: string ): boolean {
	return true;
}

export function fromJSON( json: any, constructors: { [key: string]: any } ) {

	if ( json === null || json === undefined ) {
		return null;

	} else if ( json instanceof Array ) {
		let arr: Array<any> = [];

		for ( let i in json ) {
			arr[i] = fromJSON( json[i], constructors );
		}

		return arr;

	} else if ( json instanceof Object ) {
		if ( '__pointer__' in json ) {
			return json;
		}

		let obj: any = {};

		// create empty object (classes need to have constructors that take no args)
		if ( '__class__' in json ) {
			let type = json['__class__'];

			if ( !( type in constructors ) ) {
				throw 'fromJSON: unhandled class ' + type;
			}		

			obj = new constructors[type]();
		}

		// add class members
		for ( let varname in json ) {
			obj[varname] = fromJSON( json[varname], constructors );
		}

		return obj;

	} else {
		return json;
	}
}

export function resolvePointersIn( obj: any, idIndex: Array<any>, toplevel: boolean=false ) {
	if ( obj instanceof Array ) {
		for ( let i in obj ) {

			// resolve pointer
			if ( obj[i] instanceof Object ) {
				if ( '__pointer__' in obj[i] ) {
					obj[i] = resolvePointer( obj[i]['__pointer__'], idIndex );
				} else {

					// only check indexed objects in top level
					if ( ('id' in obj[i] && toplevel) || !('id' in obj[i]) ) {
						resolvePointersIn( obj[i], idIndex );
					}
				}

			} else {
				resolvePointersIn( obj[i], idIndex );
			}
		}

	} else if ( obj instanceof Object ) {
		if ( obj['__pointer__'] ) {
			throw 'Recursing too deep (should have resolved pointer)';
		}

		for ( let i in obj ) {

			// resolve pointer
			if ( obj[i] instanceof Object ) {
				if ( '__pointer__' in obj[i] ) {
					obj[i] = resolvePointer( obj[i]['__pointer__'], idIndex );
				} else {

					// only check indexed objects in top level
					if ( ('id' in obj[i] && toplevel) || !('id' in obj[i]) ) {
						resolvePointersIn( obj[i], idIndex );
					}
				}

			} else {
				resolvePointersIn( obj[i], idIndex );
			}
		}

		// run init method after all pointers in object have been resolved
		if ( obj.init ) {
			obj.init();
		}

	} else {
		return
	}
}

function resolvePointer( index: number, idIndex: Array<any> ): any {
	if ( !(index in idIndex) ) {
		console.log( idIndex );
		throw 'resolvePointer: no pointer with id ' + index;
	}
	
	return idIndex[index];
}