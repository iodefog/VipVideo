//
//  VipURLManager.m
//  VipVideo
//
//  Created by LiHongli on 2017/10/20.
//  Copyright © 2017年 SV. All rights reserved.
//

#import "VipURLManager.h"
#import "AppDelegate.h"
#import "JSONKit.h"

@implementation VipUrlItem

+ (instancetype)createTitle:(NSString *)title url:(NSString *)url{
    VipUrlItem *model = [[VipUrlItem alloc] init];
    model.title = title;
    model.url = url;
    return model;
}


@end

/*--------------------------*/

@interface VipMenuItem : NSMenuItem

@property (nonatomic, strong) VipUrlItem *item;

@end



@implementation VipMenuItem

@end

/*--------------------------*/


@implementation VipURLManager

+ (instancetype)sharedInstance {
    static id _sharedInstance = nil;
    static dispatch_once_t oncePredicate;
    dispatch_once(&oncePredicate, ^{
        _sharedInstance = [[self alloc] init];
    });
    return _sharedInstance;
}

- (instancetype)init{
    if (self = [super init]) {
        
        self.itemsArray = [NSMutableArray array];
        self.platformItemsArray = [NSMutableArray array];
        
        [self initVipURLs];
        self.currentIndex = 0;
        
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 0.1*NSEC_PER_SEC), dispatch_get_main_queue(), ^{
            [self initDefaultData];
        });
    }
    return self;
}

- (void)initDefaultData{
    NSError *error = nil;
    NSString *path = [[NSBundle mainBundle] pathForResource:@"viplist" ofType:@"json"];
    NSData *data = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:&error];
    NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:kNilOptions error:nil];
    NSLog(@"%@,error %@",dict, error);
    [self transformJsonToModel:dict[@"list"]];
    [self transformPlatformJsonToModel:dict[@"platformlist"]];
}

- (void)initVipURLs{
    
    NSURL *url = [NSURL URLWithString:@"https://iodefog.github.io/text/viplist.json"];
    NSMutableURLRequest *urlRequest = [[NSMutableURLRequest alloc] initWithURL:url cachePolicy:NSURLRequestUseProtocolCachePolicy timeoutInterval:15];
    [NSURLConnection sendAsynchronousRequest:urlRequest
                                       queue:[NSOperationQueue mainQueue]
                           completionHandler:^(NSURLResponse * _Nullable response,
                                               NSData * _Nullable data,
                                               NSError * _Nullable connectionError) {
       if(!connectionError){
           NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:kNilOptions error:nil];
           NSLog(@"%@",dict);
           [self transformJsonToModel:dict[@"list"]];
           [self transformPlatformJsonToModel:dict[@"platformlist"]];
           
           [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoRequestSuccess object:nil];
       }else {
           NSLog(@"connectionError = %@",connectionError);
       }
   }];
}

- (void)transformPlatformJsonToModel:(NSArray *)jsonArray
{
    if ([jsonArray isKindOfClass:[NSArray class]]) {
        NSMutableArray *urlsArray = [NSMutableArray array];
        for (NSDictionary *dict in jsonArray) {
            VipUrlItem *item = [[VipUrlItem alloc] init];
            item.title = dict[@"name"];
            item.url = dict[@"url"];
            [urlsArray addObject:item];
        }
        
        [self.platformItemsArray removeAllObjects];
        [self.platformItemsArray addObjectsFromArray:urlsArray];
    }
}


- (void)transformJsonToModel:(NSArray *)jsonArray
{
    if ([jsonArray isKindOfClass:[NSArray class]]) {
        NSMutableArray *urlsArray = [NSMutableArray array];
        for (NSDictionary *dict in jsonArray) {
            VipUrlItem *item = [[VipUrlItem alloc] init];
            item.title = dict[@"name"];
            item.url = dict[@"url"];
            [urlsArray addObject:item];
        }
        
        AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
        NSMenuItem *listStatusItem = [delegate.statusItem.menu itemWithTitle:@"切换接口"];;
        NSMenuItem *listMainItem = [[NSApplication sharedApplication].mainMenu itemWithTitle:@"切换接口"];
        [listStatusItem.submenu removeAllItems];
        [listMainItem.submenu removeAllItems];
        [self.itemsArray removeAllObjects];
        [self.itemsArray addObjectsFromArray:urlsArray];
        
        [self configurationVipMenu:listMainItem.submenu];
        [self configurationVipMenu:listStatusItem.submenu];
    }
}

- (void)configurationVipMenu:(NSMenu *)menu{
    
   NSString *currentUrl = @"";

    
    NSInteger index = 0;
    for (VipUrlItem *item in [VipURLManager sharedInstance].itemsArray) {
        unichar key = ('1'+index);
        NSString *show = [NSString stringWithCharacters:&key length:1];
       
        VipMenuItem *menuItem = [[VipMenuItem alloc] initWithTitle:item.title action:@selector(vipClicked:) keyEquivalent:show];
        menuItem.item = item;
        menuItem.target = self;
        [menu addItem:menuItem];
        
        if ((!currentUrl && index == 0) || [currentUrl isEqualToString:item.url]) {
            menuItem.state = NSControlStateValueOn;
            self.currentIndex = index;
        }else {
            menuItem.state = NSControlStateValueOff;
        }
        
        index ++;
    }
}

- (NSMenuItem *)configurationGoBackMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"GoBack" key:'B' target:self action:@selector(goback:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationGoForwardMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"GoForword" key:'F' target:self action:@selector(goForward:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationQuitMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"退出" key:'Q' target:self action:@selector(quit:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationChangeUpMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"切换上一个" key:'I' target:self action:@selector(upChange:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationChangeNextMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"切换下一个" key:'J' target:self action:@selector(nextChange:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationShowMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"展示窗口" key:'D' target:self action:@selector(openVip:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationCreateMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"新建" key:'N' target:self action:@selector(createNew:)];
    [menu addItem:item];
    return item;
}

- (NSMenuItem *)configurationCopyMenuItem:(NSMenu *)menu{
    NSMenuItem *item = [VipURLManager addShowMenuItemTitle:@"复制链接" key:'C' target:self action:@selector(copyLink:)];
    [menu addItem:item];
    return item;
}

- (void)openVip:(id)sender{
    [[[NSApplication sharedApplication].windows firstObject] makeKeyAndOrderFront:nil];
}

-(void)quit:(id)sender {
    [NSApp terminate:self];
}

- (void)createNew:(id)sender{
    NSStoryboard *mainStroyBoard = [NSStoryboard storyboardWithName:@"Main" bundle:nil];
    // 必需得写成属性或者全局，不然不能弹出
    NSWindowController *windowVC = [mainStroyBoard instantiateControllerWithIdentifier:@"HLHomeWindowController"];
    
    //显示需要跳转的窗口
    [windowVC.window orderFront:nil];
    AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
    [delegate.windonwArray addObject:windowVC];
}

- (void)nextChange:(id)sender{
    if (self.currentIndex+1 < self.itemsArray.count) {
        self.currentIndex ++;
    }
    else {
        self.currentIndex = 0;
    }
    VipUrlItem *item = self.itemsArray[self.currentIndex];
    [self changeVideoItem:item];
}

- (void)upChange:(id)sender{
    if (self.currentIndex-1 < 0) {
        self.currentIndex = self.itemsArray.count - 1;
    }
    else {
        self.currentIndex --;
    }
}

- (void)copyLink:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoDidCopyCurrentURL object:nil];
}

- (void)goback:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoGoBackCurrentURL object:nil];
}

- (void)goForward:(id)sender{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoGoForwardCurrentURL object:nil];
}


- (NSString *)currentVipApi{
    if (_currentVipApi) {
       return _currentVipApi;
    }
    else {
        VipUrlItem *item = [self.itemsArray firstObject];
        return item.url;
    }
}

- (void)vipClicked:(VipMenuItem *)sender{
    if (self.currentVipApi != sender.item.url) {
        self.currentVipApi = sender.item.url;
        [self changeVideoItem:sender.item];
    }
}

- (void)willChangeVideoItem:(VipUrlItem *)item{
    [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoWillChangeCurrentApi object:nil];
}

- (void)changeVideoItem:(VipUrlItem *)item{
    [self willChangeVideoItem:item];
    
    self.currentVipApi = item.url;
    self.currentIndex = [self.itemsArray indexOfObject:item];
    
    if (self.currentVipApi) {
        [[NSNotificationCenter defaultCenter] postNotificationName:KHLVipVideoDidChangeCurrentApi object:nil];
    }
}

- (void)setCurrentIndex:(NSInteger)currentIndex{
    if (_currentIndex != currentIndex) {
        VipUrlItem *item = self.itemsArray[currentIndex];
        self.currentVipApi = item.url;

        AppDelegate *delegate = (id)[NSApplication sharedApplication].delegate;
        NSMenuItem *listStatusItem = [delegate.statusItem.menu itemWithTitle:@"切换接口"];;
        NSMenuItem *listMainItem = [[NSApplication sharedApplication].mainMenu itemWithTitle:@"切换接口"];
        
        NSMenuItem *oldItem1 = nil;
        if (_currentIndex < listStatusItem.submenu.itemArray.count) {
            oldItem1 = [listStatusItem.submenu itemAtIndex:_currentIndex];
        }
        oldItem1.state = NSControlStateValueOff;
        NSMenuItem *oldItem2 = nil;
        if (_currentIndex < listMainItem.submenu.itemArray.count) {
            oldItem2 = [listMainItem.submenu itemAtIndex:_currentIndex];
        }
        oldItem2.state = NSControlStateValueOff;
        
        _currentIndex = currentIndex;
        
        NSMenuItem *newItem1 = nil;
        if (_currentIndex < listStatusItem.submenu.itemArray.count) {
            newItem1 = [listStatusItem.submenu itemAtIndex:_currentIndex];
        }
        
        newItem1.state = NSControlStateValueOn;
        
        NSMenuItem *newItem2 = nil;
        if (_currentIndex < listMainItem.submenu.itemArray.count) {
            newItem2 = [listMainItem.submenu itemAtIndex:_currentIndex];
        }
        newItem2.state = NSControlStateValueOn;
    }
}

+ (NSMenuItem *)addShowMenuItemTitle:(NSString *)title key:(unichar)key target:(id)target action:(SEL)action{
    NSString *show = [NSString stringWithCharacters:&key length:1];
    NSMenuItem *showItem = [[NSMenuItem alloc] initWithTitle:title action:action keyEquivalent:show];
    showItem.target = target;
    return showItem;
}


@end
