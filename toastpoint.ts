export let config: { [key: string]: any } = {
	PRINT: false,
}

export let log: { [key: string]: any } = {
	TRAIL: '',
}

class TrailEntry {
	obj: any;
	varname: string | number;

	constructor( obj: any, varname: string | number ) {
		this.obj = obj;
		this.varname = varname;
	}
}

export class Toaster {
	constructors: { [key: string]: any } = {};
	idIndex: Array<any> = [];
	trail: Array<TrailEntry> = [];

	constructor( c: { [key: string]: any } ) {
		this.constructors = c;
	}

	copy( entry: TrailEntry ): Toaster {
		let toaster = new Toaster( this.constructors )
		toaster.idIndex = this.idIndex;
		toaster.trail = this.trail.concat( entry );

		return toaster;
	}

	cleanIdIndex() {
		for ( let i = 0; i < this.idIndex.length; i++ ) {
			if ( !( i in this.idIndex ) ) {
				console.log( 'listToJSON: missing __id__ ' + i );
			}
		}

		for ( let obj of this.idIndex ) {
			if ( !( '__id__' in obj ) ) {
				throw 'listToJSON: object lacks __id__';
			}
			
			delete obj['__id__'];
			delete obj['__written__'];
		}
	}
}

export function listToJSON( list: Array<any>, constructors: { [key: string]: any } ): any {
	let output: Array<any> = [];

	log.TRAIL = '';
	let toaster = new Toaster( constructors );

	try {
		for ( let i = 0; i < list.length; i++ ) {
			addToIndex( list[i], toaster, true );
		}

		for ( let i = 0; i < list.length; i++ ) {
			output[i] = toJSON( list[i], toaster.copy( new TrailEntry( list[i], i ) ), true );
		}

	} catch( error ) {
		throw error;

	} finally {
		toaster.cleanIdIndex();
	}

	return output;
}

function shouldBePointer( obj: any, toaster: Toaster ) {
	
	if ( obj instanceof Object && '__id__' in obj ) {
		if ( obj['__id__'] in toaster.idIndex && obj['__written__'] ) {
			return true;
		}
	}

	// either not a pointer-able object, or needs to be added to idIndex
	return false;
}

function addToIndex( obj: any, toaster: Toaster, prewritten: boolean=false ): boolean {
	if ( obj instanceof Object ) {
		let name = obj.constructor.name;

		if ( name != 'Object' && name != 'Array' &&
		     !( name in toaster.constructors ) ) {
			throw 'missing constructor for ' + name;
		}

		if ( !( '__id__' in obj ) ) {
			toaster.idIndex.push( obj );
			obj['__id__'] = toaster.idIndex.length - 1;
			obj['__written__'] = prewritten;

			return true;

		} else {
			if ( toaster.idIndex[obj['__id__']] != obj ) {
				throw 'addToIndex: __id__ collision at ' + obj['__id__'];
			}
		}
	}

	return false;
}

function printVar( trail: Array<TrailEntry>, reading: boolean=false ) {
	if ( trail.length < 1 ) {
		return;
	}

	let str = '';

	// pad out for depth
	for ( let entry of trail ) {
		str += '  ';
	}

	// variable name or array index
	if ( trail.length > 0 ) {
		str += trail[trail.length - 1].varname + ' ';		
	}

	let obj = trail[trail.length - 1].obj;

	// object type and value
	let type = typeof( obj );
	if ( typeof( obj ) == 'object' && obj ) {
		if ( reading && '__class__' in obj ) {		
			type = obj['__class__'];
		} else {
			type = obj.constructor.name;
		}

	} else {
		if ( typeof( obj ) == 'string' ) {
			str += '\"' + obj + '\"' + ' ';
		} else {
			str += obj + ' ';	
		}
	}

	str += '(' + type + ')';

	// pointers
	if ( typeof( obj ) == 'object' && obj ) {
		if ( reading ) {
			if ( '__pointer__' in obj ) str += ' -> ' + obj['__pointer__'];
			if ( '__id__' in obj ) str += ':' + obj['__id__']; 
		} else { 
			if ( '__id__' in obj ) str += ' -> ' + obj['__id__'];
		}
	}

	if ( config.PRINT ) console.log( str );
	log.TRAIL += str + '\n';
}

function printTrail( trail: Array<TrailEntry>, reading: boolean=false, loopIndex: number=-1 ) {
	for ( let i = 0; i < trail.length; i++ ) {
		let entry = trail[i];
		let str = '';

		if ( typeof( entry.varname ) == 'string' ) {
			str += '.' + entry.varname;
		} else if ( typeof( entry.varname ) == 'number' ) {
			str += '[' + entry.varname + ']';
		}
		
		let id = '';

		if ( entry.obj instanceof Object ) {
			if ( '__id__' in entry.obj ) {
				id = ' ' + entry.obj['__id__'];
			}

			if ( reading ) {
				str += ' (' + entry.obj['__class__'] + id + ')';
			} else {
				str += ' (' + entry.obj.constructor.name + id + ')';
			}
		} else {
			str += ' literal';
		}

		if ( i == loopIndex ) str += ' <-';
		if ( i == trail.length - 1 ) str += ' ->'

		console.log( str );
	}
}

export function toJSON( obj: any, toaster: Toaster, toplevel: boolean=false ): any {
	printVar( toaster.trail );

	if ( toaster.trail.length > 20 ) {
		printTrail( toaster.trail );
		throw 'Maximum recursion depth exceeded';
	}

	if ( obj === null || obj === undefined ) {
		return obj;

	// objects from classes in 'constructors'
	} else if ( !toplevel && shouldBePointer( obj, toaster ) ) {
		return toJSONPointer( obj, toaster );

	} else if ( obj.toJSON ) {
		addToIndex( obj, toaster );

		let output = obj.toJSON( toaster, toaster.trail );
		if ( !output ) {
			throw 'toJSON(): Bad conversion from ' + obj.constructor.name;
		}

		if ( '__id__' in obj ) {
			output['__id__'] = obj['__id__'];
			output['__class__'] = obj.constructor.name;
			obj['__written__'] = true;
		}

		return output;

	} else if ( obj instanceof Object ) {
		addToIndex( obj, toaster );

		let flat: any = {};

		if ( obj instanceof Array ) {
			flat['__array__'] = [];
		}

		if ( '__id__' in obj ) {
			flat['__id__'] = obj['__id__'];
			obj['__written__'] = true;
		}

		if ( obj.constructor.name != 'Object' && obj.constructor.name != 'Array' ) {
			flat['__class__'] = obj.constructor.name;
		}

		let target = flat;
		if ( obj instanceof Array ) target = flat['__array__'];

		for ( let varname in obj ) {
			if ( varname == '__written__') continue;

			target[varname] = toJSON( obj[varname], 
									  toaster.copy( new TrailEntry( obj[varname], varname ) ) );			
		}

		return flat;

	// literals
	} else {
		return obj;
	}
}

export function toJSONPointer( obj: any, toaster: Toaster ): any {
	if ( obj === null || obj === undefined ) {
		return null;

	// some functions force pointers, so need to add index objects here
	} else if ( !( '__id__' in obj ) ) {
		toaster.idIndex.push( obj );
		obj['__id__'] = toaster.idIndex.length - 1;
		obj['__written__'] = false;
	}

	let classname: string = '';
	if ( obj.constructor ) classname = obj.constructor.name;

	return { "__pointer__": obj['__id__'], "__class__": classname };
}

export function checkSchema( obj: any, schemaName: string ): boolean {
	return true;
}

function indexOnRead( json: any, obj: any, toaster: Toaster ) {
	// add to id index
	if ( '__id__' in json ) {
		if ( json['__id__'] in toaster.idIndex ) {
			throw 'indexOnRead(): __id__ collision at ' + json['__id__'];
		}

		toaster.idIndex[json['__id__']] = obj;
	}	
}

export function fromJSON( json: any, toaster: Toaster ) {
	log.TRAIL = '';

	return fromJSONRecur( json, toaster );
}

function fromJSONRecur( json: any, toaster: Toaster ) {
	printVar( toaster.trail, true )

	if ( toaster.trail.length > 20 ) {
		printTrail( toaster.trail, true );
		throw 'Maximum recursion depth exceeded';
	}

	if ( json === null || json === undefined ) {
		return null;

	} else if ( json instanceof Object ) {
		if ( '__pointer__' in json ) {
			return json;
		}

		let obj: any = {};

		// create empty object with factory function
		if ( '__class__' in json ) {
			let type = json['__class__'];

			if ( !( type in toaster.constructors ) ) {
				throw 'fromJSON: unhandled class ' + type;
			}		

			obj = toaster.constructors[type](); // <-- object created here

		} else if ( '__array__' in json ) {
			obj = [];
		}

		// add class members
		let target = json;
		if ( obj instanceof Array ) {
			target = json['__array__'];
		}

		for ( let varname in target ) {
			if ( varname != '__id__' ) {
				obj[varname] = fromJSONRecur( target[varname], 
											  toaster.copy( new TrailEntry( target[varname], varname ) ) );
			}
		}

		indexOnRead( json, obj, toaster );

		return obj;

	} else {
		return json;
	}
}

export function resolveList( list: Array<any>, toaster: Toaster ) {
	log.TRAIL = '';

	for ( let i = 0; i < list.length; i++ ) {
		resolvePointersIn( list[i], toaster.copy( new TrailEntry( list[i], i ) ) );
	}
}

function resolvePointersIn( obj: any, toaster: Toaster ) {
	if ( typeof( HTMLElement ) === 'function' && obj instanceof HTMLElement ) {
		return;
	}

	printVar( toaster.trail );

	let index = toaster.trail.findIndex( ( x ) => x.obj == obj );

	if ( index >= 0 && index < toaster.trail.length - 1 ) {
		printTrail( toaster.trail, false, index );

		throw 'resolvePointersIn: Loop detected';
	}

	if ( obj instanceof Array ) {
		for ( let i = 0; i < obj.length; i++ ) {

			// resolve pointer
			if ( obj[i] instanceof Object ) {
				if ( '__pointer__' in obj[i] ) {
					obj[i] = resolvePointer( obj[i]['__pointer__'], toaster );

				} else {
					resolvePointersIn( obj[i], toaster.copy( new TrailEntry( obj[i], i ) ) );
				}
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
					obj[i] = resolvePointer( obj[i]['__pointer__'], toaster );
				
				} else {
					resolvePointersIn( obj[i], toaster.copy( new TrailEntry( obj[i], i ) ) );
				}
			}
		}

	} else {
		return;
	}
}

function resolvePointer( index: number, toaster: Toaster ): any {
	if ( !( index in toaster.idIndex ) ) {
		console.log( toaster.idIndex );
		throw 'resolvePointer: no pointer with id ' + index;
	}
	
	return toaster.idIndex[index];
}

export function checkStructure( obj1: any, obj2: any, trail: Array<any>, trail2: Array<any> ): boolean {
	if ( trail.indexOf( obj1 ) >= 0 ) {
		return true;
	}

	let result: boolean = true;

	for ( let i in obj1 ) {

		// missing key
		if ( !( i in obj2 ) ) {
			let str = '';
			for ( let varname of trail2 ) {
				str += '.' + varname;
			}				
			console.log( str + '.' + i + ' missing from obj2' );
			return false;		
		}

		// object, might have to recur
		if ( obj1[i] instanceof Object ) {
			let type1 = obj1[i].constructor.name;
			let type2 = obj2[i].constructor.name;

			// mismatched types
			if ( type1 != type2 ) {
				let str = '';
				for ( let varname of trail2 ) {
					str += '.' + varname;
				}
				console.log( str + '.' + i + ' type: ' + type1 + ' != ' + type2 );
				return false;
			}

			result = result && checkStructure( obj1[i], obj2[i], trail.concat( obj1 ), trail2.concat( i ) );
			
		// a literal
		} else {
			if ( obj1[i] === obj2[i] ) {
				continue;
			} else {

				// mismatched values
				let str = '';
				for ( let varname of trail2 ) {
					str += '.' + varname;
				}				
				console.log( str + '.' + i + ': ' + obj1[i] + ' != ' + obj2[i] );
				return false;
			}
		}
	}

	// look through obj2 for keys that are not in obj1
	for ( let i in obj2 ) {

		if ( !( i in obj1 ) ) {
			let str = '';
			for ( let varname of trail2 ) {
				str += '.' + varname;
			}				
			console.log( str + '.' + i + ' missing from obj1' );			
			return false;
		}	
	}

	return result;
}